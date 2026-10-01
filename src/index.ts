import { tmpdir } from "node:os";

import * as core from "@actions/core";

import { actionContext } from "./context.js";
import { runAverto } from "./run.js";

async function main(): Promise<void> {
  const apiUrl = core.getInput("api-url", { required: true });
  const audience = core.getInput("audience", { required: true });
  const failClosed = core.getBooleanInput("fail-closed", { required: true });
  const timeoutMinutes = Number(core.getInput("timeout-minutes", { required: true }));
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0 || timeoutMinutes > 180) {
    core.setFailed("timeout-minutes must be between 1 and 180");
    return;
  }

  const result = await runAverto({
    apiUrl,
    context: actionContext(),
    getOidcToken: async () => {
      const token = await core.getIDToken(audience);
      core.setSecret(token);
      return token;
    },
    timeoutMs: timeoutMinutes * 60_000,
    tempDirectory: process.env.RUNNER_TEMP || tmpdir(),
  });

  core.setOutput("run-id", result.runId || "");
  core.setOutput("run-url", result.runUrl || "");
  core.setOutput("averto-exit-code", String(result.exitCode));
  core.setOutput("summary", result.summary);
  core.setOutput("sarif-path", result.sarifPath || "");
  if (result.warning) core.warning(result.warning);
  for (const line of result.summary.split("\n")) core.info(line);

  if (result.exitCode === 1) core.setFailed("Averto security policy failed.");
  if (result.exitCode === 2) core.setFailed("Averto configuration is invalid.");
  if (result.exitCode === 3 && failClosed) core.setFailed("Averto could not complete the security run.");
}

main().catch((error: unknown) => {
  const failClosed = core.getInput("fail-closed").trim().toLowerCase() === "true";
  const message = error instanceof Error ? error.message : "Averto Action failed";
  core.setOutput("averto-exit-code", "3");
  core.setOutput("sarif-path", "");
  core.setOutput("summary", "Averto could not complete the security run.");
  core.warning(message);
  if (failClosed) core.setFailed(message);
});
