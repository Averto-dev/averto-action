import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findingLines, logicalExitCode, summaryLine } from "../src/output.js";
import type { DiffFinding, DiffResponse } from "../src/types.js";

const findings: DiffFinding[] = [
  { fingerprint: "1", classification: "new", severity: "high", title: "Secret", target: "src/a.ts:4", remediation: "Rotate it", suppressed: false },
  { fingerprint: "2", classification: "new", severity: "medium", title: "Unsafe call", target: "src/b.ts:8", suppressed: false },
  { fingerprint: "3", classification: "unchanged", severity: "critical", title: "Old", target: "src/c.ts:1", suppressed: false },
  { fingerprint: "4", classification: "fixed", severity: "low", title: "Fixed", target: "src/d.ts:2", suppressed: false },
];

describe("developer output", () => {
  it("always emits the compact tail summary", () => {
    assert.equal(summaryLine(findings), "2 new (1 high, 1 medium) · 1 pre-existing · 1 fixed");
  });

  it("prints only unsuppressed new findings with remediation and suppression route", () => {
    const diff = { data: { state: "completed", findings, poll_after_ms: 2_000 } } as DiffResponse;
    const lines = findingLines(diff, "https://platform.averto.dev/ci/runs/1");
    assert.match(lines.join("\n"), /\[HIGH\] Secret — src\/a\.ts:4\n  Fix: Rotate it/);
    assert.doesNotMatch(lines.join("\n"), /Old/);
    assert.match(lines.at(-1) || "", /request suppression/);
  });

  it("maps policy and infrastructure outcomes to stable logical codes", () => {
    assert.equal(logicalExitCode("pass"), 0);
    assert.equal(logicalExitCode("neutral"), 0);
    assert.equal(logicalExitCode("fail"), 1);
    assert.equal(logicalExitCode("config_error"), 2);
    assert.equal(logicalExitCode("infra_error"), 3);
    assert.equal(logicalExitCode("budget_refused"), 3);
  });
});
