import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EvaluationReport } from "./EvaluationReport";
import type { EvaluationResult } from "./types";

function buildEvaluation(score: string): EvaluationResult {
  return {
    score,
    commentary: "",
    details: Array.from({ length: 15 }, (_, index) => ({
      criterion: `Critère ${index + 1}`,
      observed: index < Number(score.split("/")[0]),
      feedback: `Feedback ${index + 1}`,
    })),
  };
}

describe("EvaluationReport score palette", () => {
  it("uses rose score tint for low scores in light and dark mode", () => {
    const evaluation = buildEvaluation("0/15");
    const { rerender } = render(
      <EvaluationReport
        evaluation={evaluation}
        darkMode={false}
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-rose-100/70");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#ef4444");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#dc2626");

    rerender(
      <EvaluationReport
        evaluation={evaluation}
        darkMode
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-rose-500/14");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#ef4444");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#dc2626");
  });

  it("uses amber score tint for mid scores in light and dark mode", () => {
    const evaluation = buildEvaluation("8/15");
    const { rerender } = render(
      <EvaluationReport
        evaluation={evaluation}
        darkMode={false}
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-amber-100/75");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#f59e0b");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#d97706");

    rerender(
      <EvaluationReport
        evaluation={evaluation}
        darkMode
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-amber-500/14");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#f59e0b");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#d97706");
  });

  it("uses emerald score tint for high scores in light and dark mode", () => {
    const evaluation = buildEvaluation("12/15");
    const { rerender } = render(
      <EvaluationReport
        evaluation={evaluation}
        darkMode={false}
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-emerald-100/70");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#22c55e");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#059669");

    rerender(
      <EvaluationReport
        evaluation={evaluation}
        darkMode
        feedbackDetailLabel="standard"
        elapsedSeconds={31}
      />,
    );

    expect(screen.getByTestId("score-core").className).toContain("bg-emerald-500/14");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#22c55e");
    expect(screen.getByTestId("score-ring").getAttribute("style")).toContain("#059669");
  });
});
