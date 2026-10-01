export interface ActionContext {
  repositoryId: string;
  repository: string;
  commitSha: string;
  baseSha?: string;
  event: "pull_request" | "push" | "schedule" | "workflow_dispatch";
  gitRef: string;
  pullRequestNumber?: number;
}

export interface CiRun {
  id: string;
  state: string;
  gate_outcome?: string | null;
  summary_counts?: Record<string, number>;
}

export interface RunResponse {
  data: {
    run: CiRun;
    poll_after_ms: number;
  };
}

export interface DiffFinding {
  fingerprint: string;
  classification: "new" | "fixed" | "unchanged";
  severity: string;
  title: string;
  target: string;
  remediation?: string | null;
  suppressed: boolean;
}

export interface DiffResponse {
  data: {
    state: string;
    gate_outcome?: string | null;
    baseline_reason?: string | null;
    findings: DiffFinding[];
    poll_after_ms: number;
  };
}

export interface ActionResult {
  runId?: string;
  runUrl?: string;
  exitCode: 0 | 1 | 2 | 3;
  summary: string;
  sarifPath?: string;
  warning?: string;
}
