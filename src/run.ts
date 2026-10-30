import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { AvertoClient, ApiError } from "./client.js";
import { findingLines, logicalExitCode, summaryLine } from "./output.js";
import type { ActionContext, ActionResult } from "./types.js";

export interface RunOptions {
  apiUrl: string;
  context: ActionContext;
  oidcToken?: string;
  getOidcToken?: () => Promise<string>;
  timeoutMs: number;
  tempDirectory: string;
  client?: AvertoClient;
}

export async function runAverto(options: RunOptions): Promise<ActionResult> {
  const client = options.client ?? new AvertoClient(options.apiUrl);
  let runId: string | undefined;
  const baseRunUrl = `${options.apiUrl.replace(/\/$/, "")}/ci/runs`;
  try {
    if (options.getOidcToken) client.setOidcProvider(options.getOidcToken);
    const oidcToken = options.oidcToken ?? await options.getOidcToken?.();
    if (!oidcToken) throw new Error("GitHub OIDC token is unavailable");
    await client.exchangeOidc(oidcToken);
    const accepted = await client.createRun(options.context);
    runId = accepted.data.run.id;
    const completed = await client.waitForRun(accepted, options.timeoutMs);
    const gateOutcome = completed.data.run.gate_outcome;
    const diff = await client.getDiff(runId);
    const runUrl = `${baseRunUrl}/${runId}`;
    const resolvedGate = gateOutcome ?? diff.data.gate_outcome;
    if (resolvedGate === "budget_refused") {
      return {
        runId,
        runUrl,
        exitCode: 3,
        summary: `Averto refused this run under the configured credit budget.\nReview: ${runUrl}`,
        warning: "CI_BUDGET_REFUSED",
      };
    }
    const summary = summaryLine(diff.data.findings);
    const lines = findingLines(diff, runUrl);
    let sarifPath: string | undefined;
    const sarif = await client.downloadSarif(runId);
    if (sarif) {
      sarifPath = join(options.tempDirectory, `averto-${runId}.sarif`);
      await writeFile(sarifPath, sarif);
    }
    return {
      runId,
      runUrl,
      exitCode: logicalExitCode(resolvedGate),
      summary: [...lines, summary].join("\n"),
      sarifPath,
    };
  } catch (error) {
    const configError = error instanceof ApiError && error.code === "CI_RUN_INVALID";
    return {
      runId,
      runUrl: runId ? `${baseRunUrl}/${runId}` : undefined,
      exitCode: configError ? 2 : 3,
      summary: configError ? "Averto configuration is invalid." : "Averto could not complete the security run.",
      warning: error instanceof Error ? error.message : "unknown Averto error",
    };
  }
}
