import { expect, test } from "@playwright/test";

type DashboardStatus = "ready" | "risky" | "blocked";

function buildDashboardSnapshot(
  status: DashboardStatus,
  windowLabel: string,
  overrides?: Partial<Record<string, unknown>>,
) {
  return {
    status,
    statusMessage:
      status === "ready"
        ? "Aucun signal critique récent."
        : status === "risky"
          ? "Le projet approche d'une zone sensible."
          : "Le projet ne peut pas démarrer de nouvelle session.",
    keySource: "server",
    liveModel: "gemini-2.5-flash-native-audio-preview-12-2025",
    evalModel: "gemini-2.5-flash",
    window: "1d",
    windowLabel,
    period: {
      inputTokens: 1200,
      outputTokens: 640,
      totalTokens: 1840,
      estimatedCostUsd: 0.02,
    },
    today: {
      inputTokens: 1200,
      outputTokens: 640,
      totalTokens: 1840,
      estimatedCostUsd: 0.02,
    },
    lastSession: {
      inputTokens: 500,
      outputTokens: 220,
      totalTokens: 720,
      estimatedCostUsd: 0.01,
    },
    livePeriod: {
      inputTokens: 800,
      outputTokens: 320,
      totalTokens: 1120,
      estimatedCostUsd: 0.012,
    },
    backendPeriod: {
      inputTokens: 400,
      outputTokens: 320,
      totalTokens: 720,
      estimatedCostUsd: 0.008,
    },
    liveToday: {
      inputTokens: 800,
      outputTokens: 320,
      totalTokens: 1120,
      estimatedCostUsd: 0.012,
    },
    backendToday: {
      inputTokens: 400,
      outputTokens: 320,
      totalTokens: 720,
      estimatedCostUsd: 0.008,
    },
    recentFailures: status === "risky" ? 2 : status === "blocked" ? 4 : 0,
    lastRequest: null,
    limitsHint: "Les coûts affichés restent des estimations.",
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

test.describe("dashboard and start guardrails", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
    });
  });

  test("loads dashboard data and updates the selected range", async ({ page }) => {
    await page.route("**/api/dashboard", async (route) => {
      const body = route.request().postDataJSON() as { window?: string };
      const windowLabel =
        body.window === "7d"
          ? "7 derniers jours"
          : body.window === "30d"
            ? "30 derniers jours"
            : body.window === "1h"
              ? "Dernière heure"
              : "Dernier jour";

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(buildDashboardSnapshot("ready", windowLabel)),
      });
    });

    await page.goto("/ps");
    await page.getByRole("button", { name: "Ouvrir le tableau de bord" }).click();

    await expect(page.getByText("Dashboard")).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: /^Coût estimé$/ }).first(),
    ).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: /^Dernier jour$/ }).first(),
    ).toBeVisible();
    await expect(page.getByText(/1.?840/)).toBeVisible();

    await page.getByRole("button", { name: "7j" }).click();

    await expect(
      page.locator("div").filter({ hasText: /^7 derniers jours$/ }).first(),
    ).toBeVisible();
  });

  test("shows a risky confirmation modal before PS/PSS start", async ({ page }) => {
    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildDashboardSnapshot(
            "risky",
            "Dernière heure",
            { statusMessage: "Risque de throttling temporaire." },
          ),
        ),
      });
    });

    await page.goto("/ps");
    await page.getByPlaceholder("Collez ici la trame du patient et la grille de correction...").fill(
      ["Patient", "Nom: Doe", "Prénom: Jane", "Âge: 81", "Bonjour docteur.", "Grille de correction", "1 Recherche le temps passé au sol"].join("\n"),
    );
    await page.getByRole("button", { name: "Analyser" }).click();
    await page.getByRole("button", { name: "Démarrer" }).click();

    await expect(page.getByText("Session potentiellement instable")).toBeVisible();
    await expect(page.getByText("Risque de throttling temporaire.")).toBeVisible();

    await page.getByRole("button", { name: "Annuler" }).click();

    await expect(page.getByText("Session potentiellement instable")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Démarrer" })).toBeVisible();
  });

  test("blocks Sans PS start when readiness is blocked", async ({ page }) => {
    await page.route("**/api/dashboard", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          buildDashboardSnapshot(
            "blocked",
            "Dernière heure",
            { statusMessage: "Clé API absente ou invalide." },
          ),
        ),
      });
    });

    await page.goto("/sans-ps");
    await page.getByPlaceholder("Collez ici la station sans PS et sa grille de correction...").fill(
      ["SDD 200 : Dyscalcémies", "Grille de correction", "1 Dit qu'il appelle le réanimateur"].join("\n"),
    );
    await page.getByRole("button", { name: "Analyser" }).click();
    await page.getByRole("button", { name: "Démarrer" }).click();

    await expect(page.getByText("Session indisponible")).toBeVisible();
    await expect(page.getByText("Clé API absente ou invalide.")).toBeVisible();

    await page.getByRole("button", { name: "Fermer", exact: true }).click();

    await expect(page.getByRole("button", { name: "Démarrer" })).toBeVisible();
  });
});
