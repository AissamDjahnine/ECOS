import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";
import PsPage from "./PsPage";
import { DEFAULT_SETTINGS } from "./lib/settings";
import type { DashboardSnapshot } from "./types";
import { DEFAULT_FEMALE_VOICE } from "./lib/voices";

function hasFetchCall(
  fetchMock: ReturnType<typeof vi.fn>,
  pattern: string,
) {
  return fetchMock.mock.calls.some(([input]) => String(input).includes(pattern));
}

const {
  mockLiveConnect,
  mockRequestMicrophoneStream,
  mockStartMicrophoneStream,
  mockPlayerClose,
  mockPlayerResume,
  mockPreviewPlay,
  mockPreviewPause,
} = vi.hoisted(() => ({
  mockLiveConnect: vi.fn(),
  mockRequestMicrophoneStream: vi.fn(),
  mockStartMicrophoneStream: vi.fn(),
  mockPlayerClose: vi.fn(),
  mockPlayerResume: vi.fn(),
  mockPreviewPlay: vi.fn(),
  mockPreviewPause: vi.fn(),
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

afterEach(() => {
  vi.restoreAllMocks();
});

class MockAudio {
  src: string;
  currentTime = 0;
  duration = 2;
  paused = true;
  ended = false;
  private listeners = new Map<string, Set<() => void>>();

  constructor(src: string) {
    this.src = src;
  }

  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(type: string, listener: () => void) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  async play() {
    this.paused = false;
    this.ended = false;
    mockPreviewPlay();
    this.dispatch("play");
    return undefined;
  }

  pause() {
    this.paused = true;
    mockPreviewPause();
    this.dispatch("pause");
  }
}

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
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio);
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
    expect(hasFetchCall(fetchMock, "/api/live-token")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Continuer" }));

    await waitFor(() => {
      expect(hasFetchCall(fetchMock, "/api/live-token")).toBe(true);
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
    expect(hasFetchCall(fetchMock, "/api/live-token")).toBe(false);
  });

  it("shows 3 female and 3 male voices before revealing more", async () => {
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

    expect(
      screen.getByRole("button", { name: "Choisir la voix Zephyr" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choisir la voix Kore" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choisir la voix Puck" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choisir la voix Despina" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Choisir la voix Orus" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voir plus" }));

    expect(
      screen.getByRole("button", { name: "Choisir la voix Autonoe" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Choisir la voix Orus" }),
    ).toBeInTheDocument();
  });

  it("toggles voice preview between play and pause states", async () => {
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

    const previewButton = screen.getByRole("button", {
      name: "Écouter l'aperçu Kore",
    });

    await user.click(previewButton);

    expect(mockPreviewPlay).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Mettre en pause l'aperçu Kore" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Mettre en pause l'aperçu Kore" }),
    );

    expect(mockPreviewPause).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "Reprendre l'aperçu Kore" }),
    ).toBeInTheDocument();
  });

  it("defaults the voice from a female patient sex and sends it to live-token", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          json: async () => buildDashboardSnapshot(),
        } as Response;
      }
      if (url.includes("/api/live-token")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { voiceName?: string };
        expect(body.voiceName).toBe(DEFAULT_FEMALE_VOICE);
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
      {
        target: {
          value: [
            "Patient",
            "Nom: Doe",
            "Prénom: Jane",
            "Sexe: F",
            "Âge: 81",
            "Bonjour docteur.",
            "Grille de correction",
            "1 Recherche le temps passé au sol",
          ].join("\n"),
        },
      },
    );
    await user.click(screen.getByRole("button", { name: "Analyser" }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    await waitFor(() => {
      expect(hasFetchCall(fetchMock, "/api/live-token")).toBe(true);
    });
  });

  it("sends the manually selected voice to live-token", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/dashboard")) {
        return {
          ok: true,
          json: async () => buildDashboardSnapshot(),
        } as Response;
      }
      if (url.includes("/api/live-token")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { voiceName?: string };
        expect(body.voiceName).toBe("Charon");
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
    await user.click(screen.getByRole("button", { name: /Choisir la voix Charon/i }));
    await user.click(screen.getByRole("button", { name: "Démarrer" }));

    await waitFor(() => {
      expect(hasFetchCall(fetchMock, "/api/live-token")).toBe(true);
    });
  });
});
