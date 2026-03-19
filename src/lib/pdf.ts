import type {
  AppSettings,
  EvaluationResult,
  ParsedCase,
  TranscriptEntry,
} from "../types";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatFeedbackDetailLabel(level: AppSettings["feedbackDetailLevel"]) {
  switch (level) {
    case "brief":
      return "Brief";
    case "detailed":
      return "Detailed";
    default:
      return "Standard";
  }
}

function buildInputBlock(rawInput: string) {
  const sections = rawInput
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (sections.length === 0) {
    return '<p class="empty-copy">Aucun contenu source.</p>';
  }

  return sections
    .map(
      (section) => `
        <div class="source-section">
          ${section
            .split("\n")
            .map(
              (line) =>
                `<div class="source-line">${escapeHtml(line.trim()) || "&nbsp;"}</div>`,
            )
            .join("")}
        </div>
      `,
    )
    .join("");
}

function buildTranscriptBlock(transcript: TranscriptEntry[]) {
  const items = transcript.filter((entry) => entry.text.trim().length > 0);

  if (items.length === 0) {
    return '<p class="empty-copy">Aucune transcription.</p>';
  }

  return items
    .map((entry) => {
      const roleStyles =
        entry.role === "student"
          ? {
              tone: "Student",
              card: "#dbeafe",
              chipBg: "#2563eb",
              align: "margin-left:auto;",
            }
          : entry.role === "patient"
            ? {
                tone: "Patient",
                card: "#dcfce7",
                chipBg: "#16a34a",
                align: "margin-right:auto;",
              }
            : {
                tone: "System",
                card: "#e5e7eb",
                chipBg: "#475569",
                align: "margin:0 auto;",
              };

      return `
        <div class="transcript-card" style="${roleStyles.align} background:${roleStyles.card};">
          <div class="transcript-meta">
            <span class="transcript-role" style="background:${roleStyles.chipBg};">${roleStyles.tone}</span>
            <span>${escapeHtml(entry.timestamp)}</span>
          </div>
          <div class="transcript-text">${escapeHtml(entry.text)}</div>
        </div>
      `;
    })
    .join("");
}

function buildEvaluationBlock(evaluation: EvaluationResult | null) {
  if (!evaluation) {
    return '<p class="empty-copy">Aucune évaluation disponible.</p>';
  }

  return `
    <table class="evaluation-table">
      <thead>
        <tr>
          <th>Critère</th>
          <th>Résultat</th>
          <th>Justification</th>
        </tr>
      </thead>
      <tbody>
        ${evaluation.details
          .map(
            (detail) => `
              <tr>
                <td class="criterion-cell">${escapeHtml(detail.criterion)}</td>
                <td class="result-cell">
                  <span class="result-pill ${detail.observed ? "observed" : "missed"}">
                    ${detail.observed ? "Observé" : "Non observé"}
                  </span>
                </td>
                <td class="feedback-cell">${escapeHtml(detail.feedback)}</td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildPdfDocumentBase({
  documentTitle,
  title,
  subtitle,
  modeLabel,
  rawInput,
  transcript,
  evaluation,
  feedbackDetailLevel,
}: {
  documentTitle: string;
  title: string;
  subtitle: string;
  modeLabel: string;
  rawInput: string;
  transcript: TranscriptEntry[];
  evaluation: EvaluationResult | null;
  feedbackDetailLevel: AppSettings["feedbackDetailLevel"];
}) {
  return `
    <html>
      <head>
        <title>${escapeHtml(documentTitle)}</title>
        <style>
          :root {
            color-scheme: light;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: "Inter", "Segoe UI", Arial, sans-serif;
            margin: 0;
            padding: 32px;
            color: #0f172a;
            background: #f8fafc;
          }
          h1, h2, h3, p {
            margin: 0;
          }
          .page {
            max-width: 1120px;
            margin: 0 auto;
          }
          .hero {
            padding: 24px 28px;
            border-radius: 24px;
            background: linear-gradient(135deg, #ecfeff, #f8fafc 55%);
            border: 1px solid #bae6fd;
          }
          .hero-top {
            display: flex;
            justify-content: space-between;
            gap: 24px;
            align-items: flex-start;
          }
          .eyebrow {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 999px;
            background: #0f766e;
            color: white;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }
          .hero h1 {
            margin-top: 14px;
            font-size: 34px;
            line-height: 1.05;
            letter-spacing: -0.03em;
          }
          .hero-subtitle {
            margin-top: 8px;
            color: #475569;
            font-size: 15px;
          }
          .summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            min-width: 420px;
          }
          .mode-chip {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 6px 12px;
            border-radius: 999px;
            background: #e0f2fe;
            color: #075985;
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
          }
          .summary-card {
            border-radius: 18px;
            border: 1px solid #dbeafe;
            background: white;
            padding: 16px 18px;
          }
          .summary-label {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: #64748b;
          }
          .summary-value {
            margin-top: 10px;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.03em;
          }
          .section {
            margin-top: 24px;
            padding: 22px 24px;
            border-radius: 22px;
            background: white;
            border: 1px solid #e2e8f0;
          }
          .section h2 {
            font-size: 20px;
            margin-bottom: 14px;
            letter-spacing: -0.02em;
          }
          .source-section {
            padding: 14px 16px;
            border-radius: 16px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            margin-bottom: 12px;
          }
          .source-line {
            font-size: 13px;
            line-height: 1.6;
            color: #0f172a;
            white-space: pre-wrap;
          }
          .source-line + .source-line {
            margin-top: 4px;
          }
          .transcript-card {
            max-width: 78%;
            border-radius: 18px;
            padding: 14px 16px;
            margin-bottom: 12px;
          }
          .transcript-meta {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-bottom: 8px;
            font-size: 11px;
            color: #475569;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .transcript-role {
            padding: 4px 8px;
            border-radius: 999px;
            color: white;
            font-weight: 700;
            letter-spacing: 0.12em;
          }
          .transcript-text {
            font-size: 14px;
            line-height: 1.6;
            color: #0f172a;
            white-space: pre-wrap;
          }
          .evaluation-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 13px;
            overflow: hidden;
            border: 1px solid #cbd5e1;
            border-radius: 18px;
          }
          .evaluation-table thead th {
            text-align: left;
            padding: 14px 16px;
            background: #e2e8f0;
            color: #0f172a;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .evaluation-table tbody tr:nth-child(even) {
            background: #f8fafc;
          }
          .evaluation-table td {
            padding: 14px 16px;
            border-top: 1px solid #e2e8f0;
            vertical-align: top;
            line-height: 1.55;
          }
          .criterion-cell {
            width: 34%;
            font-weight: 600;
          }
          .result-cell {
            width: 17%;
          }
          .feedback-cell {
            width: 49%;
            color: #334155;
          }
          .result-pill {
            display: inline-block;
            padding: 6px 10px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 700;
          }
          .result-pill.observed {
            background: #dcfce7;
            color: #166534;
          }
          .result-pill.missed {
            background: #fee2e2;
            color: #991b1b;
          }
          .empty-copy {
            color: #64748b;
            font-size: 14px;
          }
          @media print {
            body {
              background: white;
              padding: 18px;
            }
            .section,
            .hero,
            .summary-card {
              box-shadow: none;
            }
          }
        </style>
      </head>
      <body>
        <div class="page">
          <section class="hero">
            <div class="hero-top">
              <div>
                <span class="eyebrow">ECOS-AI</span>
                <h1>${escapeHtml(title)}</h1>
                <p class="hero-subtitle">${escapeHtml(subtitle)}</p>
              </div>
              <div class="summary-grid">
                <div class="summary-card">
                  <div class="summary-label">Mode</div>
                  <div class="summary-value" style="font-size:18px; margin-top:12px;">
                    <span class="mode-chip">${escapeHtml(modeLabel)}</span>
                  </div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">Note finale</div>
                  <div class="summary-value">${escapeHtml(
                    evaluation?.score ?? "--/--",
                  )}</div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">Niveau d'évaluation</div>
                  <div class="summary-value" style="font-size:24px;">${formatFeedbackDetailLabel(
                    feedbackDetailLevel,
                  )}</div>
                </div>
              </div>
            </div>
          </section>

          <section class="section">
            <h2>Contenu source</h2>
            ${buildInputBlock(rawInput)}
          </section>

          <section class="section">
            <h2>Transcription</h2>
            ${buildTranscriptBlock(transcript)}
          </section>

          <section class="section">
            <h2>Évaluation</h2>
            ${buildEvaluationBlock(evaluation)}
          </section>
        </div>
      </body>
    </html>
  `;
}

export function buildPsPdfDocument(
  parsedCase: ParsedCase,
  transcript: TranscriptEntry[],
  evaluation: EvaluationResult | null,
  feedbackDetailLevel: AppSettings["feedbackDetailLevel"],
) {
  return buildPdfDocumentBase({
    documentTitle: "ECOS-AI - PS-PSS - Compte rendu",
    title: "Compte rendu PS / PSS",
    subtitle: "Simulation clinique pilotée par Gemini Live",
    modeLabel: "PS / PSS",
    rawInput: parsedCase.rawInput,
    transcript,
    evaluation,
    feedbackDetailLevel,
  });
}

export function buildSansPsPdfDocument(
  rawInput: string,
  transcript: TranscriptEntry[],
  evaluation: EvaluationResult | null,
  feedbackDetailLevel: AppSettings["feedbackDetailLevel"],
) {
  return buildPdfDocumentBase({
    documentTitle: "ECOS-AI - Sans-PS - Compte rendu",
    title: "Compte rendu Sans PS",
    subtitle: "Monologue évalué à partir de la grille collée",
    modeLabel: "Sans PS",
    rawInput,
    transcript,
    evaluation,
    feedbackDetailLevel,
  });
}
