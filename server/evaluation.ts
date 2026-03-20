import type { FeedbackDetailLevel } from "../src/types";

export function getFeedbackInstruction(level: FeedbackDetailLevel) {
  if (level === "brief") {
    return "Le feedback doit rester très concis, en une justification courte par critère.";
  }

  if (level === "detailed") {
    return "Le feedback doit être détaillé, explicite et relier précisément chaque critère aux actions ou omissions de l'étudiant.";
  }

  return "Le feedback doit expliquer brièvement ce que l'étudiant a réellement fait ou n'a pas fait pour chaque critère.";
}
