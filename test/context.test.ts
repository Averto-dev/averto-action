import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { actionContext } from "../src/context.js";

function eventFile(payload: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "averto-action-context-"));
  const path = join(directory, "event.json");
  writeFileSync(path, JSON.stringify(payload));
  return path;
}

function baseEnv(path: string): NodeJS.ProcessEnv {
  return {
    GITHUB_EVENT_PATH: path,
    GITHUB_REPOSITORY_ID: "123",
    GITHUB_REPOSITORY: "acme/app",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REF: "refs/pull/7/merge",
  };
}

describe("actionContext", () => {
  it("uses provider-owned merge and base metadata for same-repository PRs", () => {
    const env = baseEnv(eventFile({ number: 7, pull_request: { base: { sha: "b".repeat(40) } } }));
    env.GITHUB_EVENT_NAME = "pull_request";
    assert.deepEqual(actionContext(env), {
      repositoryId: "123",
      repository: "acme/app",
      commitSha: "a".repeat(40),
      baseSha: "b".repeat(40),
      event: "pull_request",
      gitRef: "refs/pull/7/merge",
      pullRequestNumber: 7,
    });
  });

  it("does not inspect fork code and uses only the event file and default environment", () => {
    const env = baseEnv(eventFile({
      number: 9,
      pull_request: {
        base: { sha: "c".repeat(40) },
        head: { repo: { fork: true }, sha: "untrusted-head" },
      },
    }));
    env.GITHUB_EVENT_NAME = "pull_request";
    assert.equal(actionContext(env).commitSha, "a".repeat(40));
    assert.equal(actionContext(env).baseSha, "c".repeat(40));
  });

  it("passes a non-zero push before SHA as a provider-verifiable hint", () => {
    const env = baseEnv(eventFile({ before: "d".repeat(40) }));
    env.GITHUB_EVENT_NAME = "push";
    env.GITHUB_REF = "refs/heads/main";
    assert.equal(actionContext(env).baseSha, "d".repeat(40));
  });

  it("rejects events outside the server contract", () => {
    const env = baseEnv(eventFile({}));
    env.GITHUB_EVENT_NAME = "pull_request_target";
    assert.throws(() => actionContext(env), /unsupported GitHub event/);
  });
});
