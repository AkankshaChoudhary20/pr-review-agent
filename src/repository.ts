import { pool } from "./db.js";
import { ReviewDetail, ReviewListItem, ReviewResult } from "./types.js";

export async function upsertPullRequest(params: {
  repo: string;
  prNumber: number;
  prTitle: string | null;
  prUrl: string | null;
  diffSummary: string;
}): Promise<number> {
  const { repo, prNumber, prTitle, prUrl, diffSummary } = params;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO pull_requests (repo, pr_number, pr_title, pr_url, diff_summary, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (repo, pr_number)
     DO UPDATE SET
       pr_title = EXCLUDED.pr_title,
       pr_url = EXCLUDED.pr_url,
       diff_summary = EXCLUDED.diff_summary,
       updated_at = now()
     RETURNING id`,
    [repo, prNumber, prTitle, prUrl, diffSummary],
  );
  return result.rows[0].id;
}

export async function insertReview(params: {
  pullRequestId: number;
  review: ReviewResult;
  rawResponse: string;
}): Promise<number> {
  const { pullRequestId, review, rawResponse } = params;
  const result = await pool.query<{ id: number }>(
    `INSERT INTO reviews
       (pull_request_id, risk_level, verdict, summary, risks, missing_tests, raw_response)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      pullRequestId,
      review.risk_level,
      review.verdict,
      review.summary,
      JSON.stringify(review.risks),
      JSON.stringify(review.missing_tests),
      rawResponse,
    ],
  );
  return result.rows[0].id;
}

export async function listReviews(limit = 200): Promise<ReviewListItem[]> {
  const result = await pool.query<ReviewListItem>(
    `SELECT r.id, r.risk_level, r.verdict, r.summary, r.created_at,
            p.repo, p.pr_number, p.pr_title, p.pr_url
     FROM reviews r
     JOIN pull_requests p ON p.id = r.pull_request_id
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return result.rows;
}

export async function getReviewById(id: number): Promise<ReviewDetail | null> {
  const result = await pool.query<ReviewDetail>(
    `SELECT r.id, r.risk_level, r.verdict, r.summary, r.risks, r.missing_tests,
            r.raw_response, r.created_at,
            p.repo, p.pr_number, p.pr_title, p.pr_url, p.diff_summary
     FROM reviews r
     JOIN pull_requests p ON p.id = r.pull_request_id
     WHERE r.id = $1`,
    [id],
  );
  return result.rows[0] ?? null;
}
