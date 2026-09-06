export type RiskLevel = "low" | "medium" | "high";
export type Verdict = "approve" | "comment" | "request_changes";

/** Structured result Claude returns for a single PR review. */
export interface ReviewResult {
  summary: string;
  risk_level: RiskLevel;
  verdict: Verdict;
  risks: string[];
  missing_tests: string[];
}

/** Minimal shape we care about from GitHub's `pull_request` webhook event. */
export interface PullRequestWebhookPayload {
  action: string;
  number: number;
  pull_request: {
    number: number;
    title: string;
    html_url: string;
    user?: { login: string };
  };
  repository: {
    name: string;
    full_name: string;
    owner: { login: string };
  };
}

/** Row shape returned by GET /reviews (joined with its parent PR). */
export interface ReviewListItem {
  id: number;
  risk_level: RiskLevel;
  verdict: Verdict;
  summary: string;
  created_at: string;
  repo: string;
  pr_number: number;
  pr_title: string | null;
  pr_url: string | null;
}

/** Row shape returned by GET /reviews/:id. */
export interface ReviewDetail extends ReviewListItem {
  risks: string[];
  missing_tests: string[];
  raw_response: string | null;
  diff_summary: string | null;
}
