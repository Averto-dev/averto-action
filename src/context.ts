import { readFileSync } from "node:fs";

import type { ActionContext } from "./types.js";

type EventPayload = {
  number?: number;
  pull_request?: { base?: { sha?: string } };
  before?: string;
};

function requiredEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function readEvent(path: string): EventPayload {
  return JSON.parse(readFileSync(path, "utf8")) as EventPayload;
}

export function actionContext(env: NodeJS.ProcessEnv = process.env): ActionContext {
  const eventName = requiredEnv("GITHUB_EVENT_NAME", env);
  const supported = ["pull_request", "push", "schedule", "workflow_dispatch"] as const;
  if (!supported.includes(eventName as (typeof supported)[number])) {
    throw new Error(`unsupported GitHub event: ${eventName}`);
  }
  const payload = readEvent(requiredEnv("GITHUB_EVENT_PATH", env));
  const context: ActionContext = {
    repositoryId: requiredEnv("GITHUB_REPOSITORY_ID", env),
    repository: requiredEnv("GITHUB_REPOSITORY", env),
    commitSha: requiredEnv("GITHUB_SHA", env),
    event: eventName as ActionContext["event"],
    gitRef: requiredEnv("GITHUB_REF", env),
  };
  if (context.event === "pull_request") {
    if (!Number.isSafeInteger(payload.number) || Number(payload.number) <= 0) {
      throw new Error("pull request event is missing its number");
    }
    context.pullRequestNumber = Number(payload.number);
    if (payload.pull_request?.base?.sha) context.baseSha = payload.pull_request.base.sha;
  } else if (context.event === "push" && payload.before && !/^0{40}$/.test(payload.before)) {
    context.baseSha = payload.before;
  }
  return context;
}
