import { describe, expect, it } from "vitest";
import { parseCaseInput } from "./parser";

describe("parseCaseInput", () => {
  it("extracts nom and prénoms without truncating plural labels", () => {
    const input = `
Trame du patient

NOM

Lalo

Prénoms

Thomas

Sexe

Masculin

Âge

27 ans

Grille de correction

Critère 1
`;

    const parsed = parseCaseInput(input);

    expect(parsed.patientLastName).toBe("Lalo");
    expect(parsed.patientFirstName).toBe("Thomas");
    expect(parsed.patientName).toBe("Thomas Lalo");
  });
});
