import crypto from "crypto";
import { Octokit } from "@octokit/rest";
import { config } from "./config.js";

/**
 * Verify GitHub's `X-Hub-Signature-256` header against the raw request body.
 *
 * GitHub signs the exact bytes it sent using HMAC-SHA256 with the webhook
 * secret, formatted as `sha256=<hex digest>`. We recompute the same digest
 * over the raw body and compare with a timing-safe equality check.
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !secret) return false;

  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signatureHeader);

  // Buffers must be equal length for timingSafeEqual — a length mismatch
  // (e.g. a malformed header) means it's not a valid signature anyway.
  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createOctokit(): Octokit {
  return new Octokit({ auth: config.githubToken || undefined });
}

/**
 * Fetch a pull request's diff via the PR files endpoint / diff media type.
 * Requesting `mediaType: { format: "diff" }` makes GitHub return the raw
 * unified diff as a string instead of the usual JSON PR object.
 */
export async function fetchPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<string> {
  const response = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: { format: "diff" },
  });

  // With mediaType.format = "diff", Octokit types this as the PR object,
  // but at runtime GitHub returns (and the request lib passes through) the
  // raw diff text.
  const diff: unknown = response.data;
  if (typeof diff !== "string") {
    throw new Error("GitHub returned a non-text pull request diff");
  }
  return diff;
}

export async function postPullRequestComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

