import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ApiError, AvertoClient } from "../src/client.js";
import { runAverto } from "../src/run.js";
import type { DiffResponse, RunResponse } from "../src/types.js";

const run = (gateOutcome: string): RunResponse => ({ data: { run: { id: "run-1", state: "completed", gate_outcome: gateOutcome }, poll_after_ms: 2000 } });
const diff: DiffResponse = { data: { state: "completed", gate_outcome: "pass", findings: [], poll_after_ms: 2000 } };

function fakeClient(overrides: Partial<AvertoClient> = {}): AvertoClient {
  return {
    exchangeOidc: async () => undefined,
    createRun: async () => run("pass"),
    waitForRun: async () => run("pass"),
    getDiff: async () => diff,
    downloadSarif: async () => new TextEncoder().encode('{"version":"2.1.0"}'),
    ...overrides,
  } as unknown as AvertoClient;
}

const context = { repositoryId: "123", repository: "acme/app", commitSha: "a".repeat(40), event: "push" as const, gitRef: "refs/heads/main" };

describe("runAverto", () => {
  it("returns outputs and writes the downloaded SARIF", async () => {
    const directory = mkdtempSync(join(tmpdir(), "averto-action-run-"));
    const result = await runAverto({ apiUrl: "https://averto.example", context, oidcToken: "token", timeoutMs: 1000, tempDirectory: directory, client: fakeClient() });
    assert.equal(result.exitCode, 0);
    assert.equal(result.runId, "run-1");
    assert.ok(result.sarifPath);
    assert.match(await readFile(result.sarifPath, "utf8"), /2\.1\.0/);
  });

  it("returns logical code 1 for a policy gate failure", async () => {
    const result = await runAverto({ apiUrl: "https://averto.example", context, oidcToken: "token", timeoutMs: 1000, tempDirectory: tmpdir(), client: fakeClient({ waitForRun: async () => run("fail") }) });
    assert.equal(result.exitCode, 1);
  });

  it("separates configuration errors from fail-open infrastructure errors", async () => {
    const configuration = await runAverto({ apiUrl: "https://averto.example", context, oidcToken: "token", timeoutMs: 1000, tempDirectory: tmpdir(), client: fakeClient({ createRun: async () => { throw new ApiError("invalid", 422, "CI_RUN_INVALID"); } }) });
    const infrastructure = await runAverto({ apiUrl: "https://averto.example", context, oidcToken: "token", timeoutMs: 1000, tempDirectory: tmpdir(), client: fakeClient({ createRun: async () => { throw new ApiError("offline", 503); } }) });
    assert.equal(configuration.exitCode, 2);
    assert.equal(infrastructure.exitCode, 3);
  });

  it("maps budget refusals to exit 3 with an explicit summary", async () => {
    const result = await runAverto({
      apiUrl: "https://averto.example",
      context,
      oidcToken: "token",
      timeoutMs: 1000,
      tempDirectory: tmpdir(),
      client: fakeClient({
        waitForRun: async () => run("budget_refused"),
        getDiff: async () => ({ data: { state: "failed", gate_outcome: "budget_refused", findings: [], poll_after_ms: 2000 } }),
      }),
    });
    assert.equal(result.exitCode, 3);
    assert.equal(result.warning, "CI_BUDGET_REFUSED");
    assert.match(result.summary, /credit budget/);
  });
});
