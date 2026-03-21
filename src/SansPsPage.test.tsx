import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import SansPsPage from "./SansPsPage";
import { DEFAULT_SETTINGS } from "./lib/settings";
import type { DashboardSnapshot } from "./types";

const {
  mockLiveConnect,
  mockRequestMicrophoneStream,
  mockStartMicrophoneStream,
  liveCallbacksRef,
  liveSessionRef,
} = vi.hoisted(() => ({
    mockLiveConnect: vi.fn(),
    mockRequestMicrophoneStream: vi.fn(),
    mockStartMicrophoneStream: vi.fn(),
    liveCallbacksRef: {
      current: null as Record<string, ((...args: unknown[]) => unknown) | undefined> | null,
    },
    liveSessionRef: {
      current: null as {
        close: ReturnType<typeof vi.fn>;
        sendRealtimeInput: ReturnType<typeof vi.fn>;
        sendClientContent: ReturnType<typeof vi.fn>;
      } | null,
    },
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
    liveCallbacksRef.current = null;
    liveSessionRef.current = null;
    mockLiveConnect.mockImplementation(async ({ callbacks }) => {
      liveCallbacksRef.current = callbacks;
      liveSessionRef.current = {
        close: vi.fn(() => {
          callbacks?.onclose?.();
        }),
        sendRealtimeInput: vi.fn(),
        sendClientContent: vi.fn(),
      };
      callbacks?.onopen?.();
      return liveSessionRef.current;
    });
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
    await user.click(screen.getByRole("button", { name: "Oui, terminer" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "PS / PSS" })).toBeEnabled();
    }, { timeout: 3000 });
  }, 15000);

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
    await user.click(screen.getByRole("button", { name: "Oui, terminer" }));

    await waitFor(() => {
      expect(
        screen.getByText(/session démarrée\./i),
      ).toBeInTheDocument();
    }, { timeout: 3000 });
  }, 10000);

  it("renders monologue text from live input transcription and only sends audioStreamEnd on mute", async () => {
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

    await waitFor(() => {
      expect(liveCallbacksRef.current?.onmessage).toBeTypeOf("function");
    });

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: {
          text: "Le patient doit bénéficier d'une scintigraphie au SESTA-MIBI.",
        },
        serverContent: {
          waitingForInput: true,
        },
      });
    });

    expect(
      screen.getByText(/scintigraphie au SESTA-MIBI/i, {
        selector: "div.whitespace-pre-wrap",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /couper le microphone/i }),
    );

    expect(liveSessionRef.current?.sendRealtimeInput).toHaveBeenCalledWith({
      audioStreamEnd: true,
    });
    expect(liveSessionRef.current?.sendClientContent).not.toHaveBeenCalled();
  }, 10000);

  it("flushes pending student speech after manual mute even without turnComplete", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Analyser" }));
    fireEvent.click(screen.getByRole("button", { name: "Démarrer" }));

    await waitFor(() => {
      expect(liveCallbacksRef.current?.onmessage).toBeTypeOf("function");
    });

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: {
          text: "Le patient doit bénéficier",
        },
      });
    });

    fireEvent.click(
      screen.getByRole("button", { name: /couper le microphone/i }),
    );

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: {
          text: "d'une scintigraphie au SESTA-MIBI.",
        },
      });
    });

    await waitFor(() => {
      expect(
        screen.getByText(/scintigraphie au SESTA-MIBI/i, {
          selector: "div.whitespace-pre-wrap",
        }),
      ).toBeInTheDocument();
    }, { timeout: 2500 });
  }, 12000);

  it("keeps a single student bubble and appends new flushed segments to it", async () => {
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

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: {
          text: "Premier segment.",
        },
        serverContent: {
          waitingForInput: true,
        },
      });
    });

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: {
          text: "Deuxième segment.",
        },
        serverContent: {
          waitingForInput: true,
        },
      });
    });

    const studentBubbles = screen.getAllByText(/segment\./i, {
      selector: "div.whitespace-pre-wrap",
    });

    expect(studentBubbles).toHaveLength(1);
    expect(studentBubbles[0]).toHaveTextContent(
      "Premier segment. Deuxième segment.",
    );
  });

  it("pausing the session mutes the microphone and resumes it on continue", async () => {
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

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByText("Coupé")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reprendre" }));
    expect(screen.getByText("Actif")).toBeInTheDocument();
  });

  it("does not render a second draft bubble when a student bubble already exists", async () => {
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

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: { text: "Premier segment." },
        serverContent: { waitingForInput: true },
      });
    });

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: { text: "Suite en cours" },
      });
    });

    expect(screen.getAllByText("STUDENT")).toHaveLength(1);
    expect(
      screen.getByText(/Premier segment\. Suite en cours/i, {
        selector: "div.whitespace-pre-wrap",
      }),
    ).toBeInTheDocument();
  });

  it("preserves the last pending transcription when pausing", async () => {
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

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: { text: "Texte avant pause." },
      });
    });

    await user.click(screen.getByRole("button", { name: "Pause" }));

    await act(async () => {
      liveCallbacksRef.current?.onmessage?.({
        inputTranscription: { text: "Suite finale." },
        serverContent: { waitingForInput: true },
      });
    });

    expect(
      screen.getByText(/Texte avant pause\. Suite finale\./i, {
        selector: "div.whitespace-pre-wrap",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Coupé")).toBeInTheDocument();
  });

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
    await user.click(screen.getByRole("button", { name: "Effacer" }));
    await user.click(screen.getByRole("button", { name: "Oui, effacer" }));

    expect(textarea).toHaveValue("");
    expect(screen.getByText("Session sans PS prête")).toBeInTheDocument();
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

  it("shows French label on the AI correction button before and after session", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => buildDashboardSnapshot("ready"),
    } as Response));

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

    // Before session: button shows icon and is disabled
    expect(
      screen.getByRole("button", { name: /correction ia/i }),
    ).toBeDisabled();
  });

});
