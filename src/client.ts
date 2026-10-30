import { setTimeout as delay } from "node:timers/promises";

import type { ActionContext, DiffResponse, RunResponse } from "./types.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

export class AvertoClient {
  private token?: string;
  private tokenExpiresAtMs = 0;
  private oidcProvider?: () => Promise<string>;

  constructor(
    private readonly baseUrl: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async exchangeOidc(oidcToken: string): Promise<void> {
    const response = await this.request<{ data: { token: string; expires_at?: number } }>("/api/ci/token", {
      method: "POST",
      body: JSON.stringify({ provider: "github", oidc_token: oidcToken }),
    }, false);
    this.token = response.data.token;
    this.tokenExpiresAtMs = (response.data.expires_at || Math.floor(Date.now() / 1000) + 600) * 1_000;
  }

  setOidcProvider(provider: () => Promise<string>): void {
    this.oidcProvider = provider;
  }

  async createRun(context: ActionContext): Promise<RunResponse> {
    return this.request<RunResponse>("/api/ci/runs", {
      method: "POST",
      body: JSON.stringify({
        repository_id: context.repositoryId,
        repository: context.repository,
        commit_sha: context.commitSha,
        base_sha: context.baseSha,
        event: context.event,
        ref: context.gitRef,
        pull_request_number: context.pullRequestNumber,
      }),
    });
  }

  getRun(runId: string): Promise<RunResponse> {
    return this.request(`/api/ci/runs/${encodeURIComponent(runId)}`);
  }

  getDiff(runId: string): Promise<DiffResponse> {
    return this.request(`/api/ci/runs/${encodeURIComponent(runId)}/diff`);
  }

  async downloadSarif(runId: string): Promise<Uint8Array | undefined> {
    const response = await this.raw(`/api/ci/runs/${encodeURIComponent(runId)}/sarif`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw await this.error(response);
    return new Uint8Array(await response.arrayBuffer());
  }

  async waitForRun(initial: RunResponse, timeoutMs: number): Promise<RunResponse> {
    let current = initial;
    const deadline = Date.now() + timeoutMs;
    // Keep polling while the run is active, and also while it is marked
    // completed without a gate yet (diff finalization still in flight).
    while (this.shouldKeepPolling(current)) {
      if (Date.now() >= deadline) throw new ApiError("timed out waiting for Averto", 504, "CI_TIMEOUT");
      const suggested = Math.max(500, Math.min(current.data.poll_after_ms || 2_000, 15_000));
      const jitter = Math.floor(Math.random() * Math.min(500, suggested / 4));
      await delay(suggested + jitter);
      current = await this.getRun(current.data.run.id);
    }
    return current;
  }

  private shouldKeepPolling(current: RunResponse): boolean {
    const { state, gate_outcome: gateOutcome } = current.data.run;
    if (["queued", "running"].includes(state)) return true;
    // Completed scans publish Checks only after finalize sets gate_outcome.
    // Returning early here caused a false Action pass while Checks failed.
    if (state === "completed" && (gateOutcome === null || gateOutcome === undefined)) return true;
    return false;
  }

  private async request<T>(path: string, init: RequestInit = {}, authenticate = true): Promise<T> {
    if (authenticate && this.oidcProvider && this.tokenExpiresAtMs <= Date.now() + 60_000) {
      await this.exchangeOidc(await this.oidcProvider());
    }
    const response = await this.raw(path, init);
    if (!response.ok) throw await this.error(response);
    return (await response.json()) as T;
  }

  private raw(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (init.body) headers.set("content-type", "application/json");
    if (this.token) headers.set("authorization", `Bearer ${this.token}`);
    return this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(30_000),
    });
  }

  private async error(response: Response): Promise<ApiError> {
    let code: string | undefined;
    let message = `Averto API returned ${response.status}`;
    try {
      const body = (await response.json()) as { error?: { code?: string; error?: string } };
      code = body.error?.code;
      message = body.error?.error || message;
    } catch {
      // Provider errors may be non-JSON; never echo an untrusted response body.
    }
    return new ApiError(message, response.status, code);
  }
}
