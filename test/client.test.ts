import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AvertoClient, ApiError } from "../src/client.js";

describe("AvertoClient", () => {
  it("exchanges OIDC and sends repository identity with the scoped token", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const responses = [
      new Response(JSON.stringify({ data: { token: "ci-token" } }), { status: 200 }),
      new Response(JSON.stringify({ data: { run: { id: "run-1", state: "queued" }, poll_after_ms: 2000 } }), { status: 202 }),
    ];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return responses.shift()!;
    };
    const client = new AvertoClient("https://averto.example/", fetcher);
    await client.exchangeOidc("oidc-token");
    await client.createRun({
      repositoryId: "123",
      repository: "acme/app",
      commitSha: "a".repeat(40),
      event: "push",
      gitRef: "refs/heads/main",
    });
    assert.equal(calls[0]?.[0], "https://averto.example/api/ci/token");
    const request = calls[1]?.[1];
    assert.equal(new Headers(request?.headers).get("authorization"), "Bearer ci-token");
    assert.deepEqual(
      Object.fromEntries(Object.entries(JSON.parse(String(request?.body))).filter(([key]) => ["repository_id", "event"].includes(key))),
      { repository_id: "123", event: "push" },
    );
  });

  it("keeps structured API codes without exposing response bodies", async () => {
    const fetcher: typeof fetch = async () => new Response(
      JSON.stringify({ error: { code: "CI_RUN_INVALID", error: "bad config" } }),
      { status: 422 },
    );
    const client = new AvertoClient("https://averto.example", fetcher);
    await assert.rejects(
      client.createRun({
        repositoryId: "123", repository: "acme/app", commitSha: "a".repeat(40), event: "push", gitRef: "refs/heads/main",
      }),
      (error: unknown) => error instanceof ApiError && error.code === "CI_RUN_INVALID" && error.status === 422,
    );
  });

  it("treats disabled SARIF as an absent artifact", async () => {
    const fetcher: typeof fetch = async () => new Response("", { status: 404 });
    assert.equal(await new AvertoClient("https://averto.example", fetcher).downloadSarif("run-1"), undefined);
  });

  it("refreshes a short-lived CI token during long polls", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const responses = [
      new Response(JSON.stringify({ data: { token: "expired", expires_at: 1 } }), { status: 200 }),
      new Response(JSON.stringify({ data: { token: "fresh", expires_at: 4_102_444_800 } }), { status: 200 }),
      new Response(JSON.stringify({ data: { run: { id: "run-1", state: "completed" }, poll_after_ms: 2000 } }), { status: 200 }),
    ];
    const fetcher: typeof fetch = async (input, init) => {
      calls.push([input, init]);
      return responses.shift()!;
    };
    const client = new AvertoClient("https://averto.example", fetcher);
    client.setOidcProvider(async () => "fresh-oidc");
    await client.exchangeOidc("initial-oidc");
    await client.getRun("run-1");
    assert.equal(calls.length, 3);
    assert.equal(new Headers(calls[2]?.[1]?.headers).get("authorization"), "Bearer fresh");
  });

  it("keeps polling completed runs until gate_outcome is finalized", async () => {
    const responses = [
      new Response(JSON.stringify({ data: { run: { id: "run-1", state: "running" }, poll_after_ms: 1 } }), { status: 200 }),
      new Response(JSON.stringify({ data: { run: { id: "run-1", state: "completed" }, poll_after_ms: 1 } }), { status: 200 }),
      new Response(JSON.stringify({ data: { run: { id: "run-1", state: "completed", gate_outcome: "fail" }, poll_after_ms: 1 } }), { status: 200 }),
    ];
    const fetcher: typeof fetch = async () => responses.shift()!;
    const client = new AvertoClient("https://averto.example", fetcher);
    const initial = { data: { run: { id: "run-1", state: "queued" }, poll_after_ms: 1 } };
    const completed = await client.waitForRun(initial, 5_000);
    assert.equal(completed.data.run.state, "completed");
    assert.equal(completed.data.run.gate_outcome, "fail");
    assert.equal(responses.length, 0);
  });
});
