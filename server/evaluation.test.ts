import { getFeedbackInstruction } from "./evaluation";

describe("getFeedbackInstruction", () => {
  it("returns the brief instruction", () => {
    expect(getFeedbackInstruction("brief")).toMatch(/très concis/i);
  });

  it("returns the standard instruction", () => {
    expect(getFeedbackInstruction("standard")).toMatch(/expliquer brièvement/i);
  });

  it("returns the detailed instruction", () => {
    expect(getFeedbackInstruction("detailed")).toMatch(/détaillé/i);
    expect(getFeedbackInstruction("detailed")).toMatch(/actions ou omissions/i);
  });
});
