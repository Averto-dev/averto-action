import type { DiffFinding, DiffResponse } from "./types.js";

const severityOrder = ["critical", "high", "medium", "low", "info"];

export function summaryLine(findings: DiffFinding[]): string {
  const count = (classification: DiffFinding["classification"]) =>
    findings.filter((finding) => finding.classification === classification).length;
  const newFindings = findings.filter((finding) => finding.classification === "new");
  const severities = severityOrder
    .map((severity) => [severity, newFindings.filter((finding) => finding.severity === severity).length] as const)
    .filter(([, total]) => total > 0)
    .map(([severity, total]) => `${total} ${severity}`)
    .join(", ");
  const detail = severities ? ` (${severities})` : "";
  return `${newFindings.length} new${detail} · ${count("unchanged")} pre-existing · ${count("fixed")} fixed`;
}

export function findingLines(diff: DiffResponse, runUrl: string): string[] {
  const lines = diff.data.findings
    .filter((finding) => finding.classification === "new" && !finding.suppressed)
    .map((finding) => {
      const location = finding.target ? ` — ${finding.target}` : "";
      const remediation = finding.remediation ? `\n  Fix: ${finding.remediation}` : "";
      return `[${finding.severity.toUpperCase()}] ${finding.title}${location}${remediation}`;
    });
  if (lines.length > 0) {
    lines.push(`Review evidence or request suppression: ${runUrl}`);
  } else if (diff.data.baseline_reason === "no_baseline") {
    lines.push("No trusted baseline exists yet; Averto reported this run as neutral.");
  }
  return lines;
}

export function logicalExitCode(gateOutcome?: string | null): 0 | 1 | 2 | 3 {
  switch (gateOutcome) {
    case "fail":
      return 1;
    case "config_error":
      return 2;
    case "infra_error":
    case "budget_refused":
      // Quota refusals are infrastructure/quota class (exit 3), not a clean pass.
      return 3;
    default:
      return 0;
  }
}
