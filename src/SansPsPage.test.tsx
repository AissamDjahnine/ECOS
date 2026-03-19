import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import SansPsPage from "./SansPsPage";
import { DEFAULT_SETTINGS } from "./lib/settings";

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

describe("SansPsPage", () => {
  beforeEach(() => {
    mockRequestMicrophoneStream.mockResolvedValue({
      getTracks: () => [],
    });
    mockStartMicrophoneStream.mockResolvedValue({
      stop: vi.fn().mockResolvedValue(null),
    });
    vi.stubGlobal("fetch", vi.fn());
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

});
