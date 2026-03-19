import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import PsPage from "./PsPage";
import { DEFAULT_SETTINGS } from "./lib/settings";
import type { DashboardSnapshot } from "./types";

const {
  mockLiveConnect,
  mockRequestMicrophoneStream,
  mockStartMicrophoneStream,
  mockPlayerClose,
  mockPlayerResume,
} = vi.hoisted(() => ({
  mockLiveConnect: vi.fn(),
  mockRequestMicrophoneStream: vi.fn(),
  mockStartMicrophoneStream: vi.fn(),
  mockPlayerClose: vi.fn(),
  mockPlayerResume: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    live = {
      connect: mockLiveConnect,
    };
  },
  ActivityHandling: { START_OF_ACTIVITY_INTERRUPTS: "interrupts" },
  EndSensitivity: { END_SENSITIVITY_LOW: "low" },
  Modality: { AUDIO: "audio" },
  StartSensitivity: { START_SENSITIVITY_HIGH: "high" },
  TurnCoverage: { TURN_INCLUDES_ONLY_ACTIVITY: "turn" },
}));

vi.mock("./lib/audio", () => ({
  requestMicrophoneStream: mockRequestMicrophoneStream,
  startMicrophoneStream: mockStartMicrophoneStream,
  PcmPlayer: class {
    resume = mockPlayerResume;
    getRecordingStream() {
      return { getTracks: () => [] } as unknown as MediaStream;
    }
    interrupt() {}
    playChunk() {}
    close = mockPlayerClose;
  },
}));

const validCase = [
  "Patient",
  "Nom: Doe",
  "Prénom: Jane",
  "Âge: 81",
  "Bonjour docteur.",
  "Grille de correction",
  "1 Recherche le temps passé au sol",
].join("\n");

function buildDashboardSnapshot(
  status: DashboardSnapshot["status"] = "ready",
  statusMessage = "Projet prêt.",
): DashboardSnapshot {
  return {
    status,
    statusMessage,
    keySource: "server",
    liveModel: "gemini-live",
    evalModel: "gemini-flash",
    window: "1h",
    windowLabel: "Dernière heure",
    period: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    today: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    lastSession: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    livePeriod: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    backendPeriod: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    liveToday: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    backendToday: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    recentFailures: 0,
    lastRequest: null,
    limitsHint: "",
    updatedAt: new Date().toISOString(),
  };
}

describe("PsPage", () => {
  beforeEach(() => {
    mockLiveConnect.mockResolvedValue({
      close: vi.fn(),
      sendRealtimeInput: vi.fn(),
    });
    mockRequestMicrophoneStream.mockResolvedValue({
      getTracks: () => [],
    });
    mockStartMicrophoneStream.mockResolvedValue({
      stop: vi.fn().mockResolvedValue(null),
    });
    mockPlayerResume.mockResolvedValue(undefined);
    mockPlayerClose.mockResolvedValue(undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/dashboard")) {
          return {
            ok: true,
            json: async () => buildDashboardSnapshot(),
          } as Response;
        }
        if (url.includes("/api/live-token")) {
          return {
            ok: true,
            json: async () => ({
              token: "temporary-token",
              model: "fake-live-model",
            }),
          } as Response;
        }

        throw new Error(`Unexpected fetch call: ${url}`);
      }),
    );
  });

  it("disables cross-mode navigation during an active session and re-enables it after terminate", async () => {
    const user = userEvent.setup();

    render(
      <PsPage
        currentMode="ps"
        onNavigate={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        /collez ici la trame du patient et la grille de correction/i,
      ),
      { target: { value: validCase } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    const otherModeButton = screen.getByRole("button", { name: "Sans PS" });
    expect(otherModeButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Sans PS" })).toBeEnabled();
    });
  }, 10000);

  it("resets the session state without clearing the pasted case text", async () => {
    const user = userEvent.setup();

    render(
      <PsPage
        currentMode="ps"
        onNavigate={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      /collez ici la trame du patient et la grille de correction/i,
    );

    fireEvent.change(textarea, { target: { value: validCase } });
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));
    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Reset" })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: "Reset" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => {
      expect(textarea).toHaveValue(validCase);
      expect(
        screen.getByText(/la transcription apparaîtra ici/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/session réinitialisée/i),
      ).toBeInTheDocument();
    });
  }, 10000);

  it("asks for confirmation before starting when readiness is risky", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          json: async () =>
            buildDashboardSnapshot("risky", "Quota proche de la limite."),
        } as Response;
      }
      if (url.includes("/api/live-token")) {
        return {
          ok: true,
          json: async () => ({
            token: "temporary-token",
            model: "fake-live-model",
          }),
        } as Response;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PsPage
        currentMode="ps"
        onNavigate={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        /collez ici la trame du patient et la grille de correction/i,
      ),
      { target: { value: validCase } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(
      screen.getByText(/session potentiellement instable/i),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/live-token",
      expect.anything(),
    );

    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/live-token",
        expect.anything(),
      );
    });
  });

  it("blocks start when readiness is blocked", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          json: async () =>
            buildDashboardSnapshot("blocked", "Clé API manquante."),
        } as Response;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PsPage
        currentMode="ps"
        onNavigate={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        /collez ici la trame du patient et la grille de correction/i,
      ),
      { target: { value: validCase } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(screen.getByText(/session indisponible/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/live-token",
      expect.anything(),
    );
  });
});
