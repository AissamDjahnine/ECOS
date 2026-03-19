import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import SansPsPage from "./SansPsPage";
import { DEFAULT_SETTINGS } from "./lib/settings";
import type { DashboardSnapshot } from "./types";

const { mockRequestMicrophoneStream, mockStartMicrophoneStream } = vi.hoisted(
  () => ({
    mockRequestMicrophoneStream: vi.fn(),
    mockStartMicrophoneStream: vi.fn(),
  }),
);

vi.mock("./lib/audio", () => ({
  requestMicrophoneStream: mockRequestMicrophoneStream,
  startMicrophoneStream: mockStartMicrophoneStream,
}));

const validStation = [
  "SDD 200 : Dyscalcémies",
  "Grille de correction",
  "1 Dit qu'il appelle le réanimateur",
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

describe("SansPsPage", () => {
  beforeEach(() => {
    mockRequestMicrophoneStream.mockResolvedValue({
      getTracks: () => [],
    });
    mockStartMicrophoneStream.mockResolvedValue({
      stop: vi.fn().mockResolvedValue(null),
    });
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
        throw new Error(`Unexpected fetch call: ${url}`);
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("disables cross-mode navigation during a session and re-enables it after terminate", async () => {
    const user = userEvent.setup();

    render(
      <SansPsPage
        currentMode="sans-ps"
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
        /collez ici la station sans ps et sa grille de correction/i,
      ),
      { target: { value: validStation } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(screen.getByRole("button", { name: "PS / PSS" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PS / PSS" })).toBeEnabled();
    });
  }, 10000);

  it("hides live transcript during the session but shows the final transcript after ending", async () => {
    const user = userEvent.setup();

    render(
      <SansPsPage
        currentMode="sans-ps"
        onNavigate={vi.fn()}
        settings={{ ...DEFAULT_SETTINGS, showLiveTranscript: false }}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        /collez ici la station sans ps et sa grille de correction/i,
      ),
      { target: { value: validStation } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(
      screen.getByText(/la transcription en direct est masquée/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/monologue démarré\. présentez votre raisonnement/i),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Terminer" }));

    await waitFor(() => {
      expect(
        screen.getByText(/monologue démarré\. présentez votre raisonnement/i),
      ).toBeInTheDocument();
    });
  }, 10000);

  it("clears the station textarea when clicking Clear", async () => {
    const user = userEvent.setup();

    render(
      <SansPsPage
        currentMode="sans-ps"
        onNavigate={vi.fn()}
        settings={DEFAULT_SETTINGS}
        onOpenDashboard={vi.fn()}
        onOpenSettings={vi.fn()}
        darkMode={false}
        onDarkModeChange={vi.fn()}
      />,
    );

    const textarea = screen.getByPlaceholderText(
      /collez ici la station sans ps et sa grille de correction/i,
    );

    fireEvent.change(textarea, { target: { value: validStation } });
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await user.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(textarea).toHaveValue("");
    expect(screen.getByText("Mode sans PS prêt")).toBeInTheDocument();
  });

  it("asks for confirmation before starting when readiness is risky", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          json: async () =>
            buildDashboardSnapshot("risky", "Risque de saturation API."),
        } as Response;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SansPsPage
        currentMode="sans-ps"
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
        /collez ici la station sans ps et sa grille de correction/i,
      ),
      { target: { value: validStation } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(
      screen.getByText(/session potentiellement instable/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuer" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Terminer" })).toBeEnabled();
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
            buildDashboardSnapshot("blocked", "Clé API introuvable."),
        } as Response;
      }
      throw new Error(`Unexpected fetch call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SansPsPage
        currentMode="sans-ps"
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
        /collez ici la station sans ps et sa grille de correction/i,
      ),
      { target: { value: validStation } },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    expect(screen.getByText(/session indisponible/i)).toBeInTheDocument();
    expect(screen.queryByText("Monologue")).not.toBeInTheDocument();
  });

});
