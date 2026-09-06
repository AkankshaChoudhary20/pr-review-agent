import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";
import { ReviewResult } from "./types.js";

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey || undefined });

// Keep prompts (and cost) bounded — very large diffs get truncated with a
// clear marker rather than silently dropped or sent in full.
const MAX_DIFF_CHARS = 15_000;

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "1-3 sentence summary of what this PR changes.",
    },
    risk_level: {
      type: "string",
      enum: ["low", "medium", "high"],
      description: "Overall risk of merging this change as-is.",
    },
    verdict: {
      type: "string",
      enum: ["approve", "comment", "request_changes"],
      description: "Recommended review verdict.",
    },
    risks: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific risks, bugs, or concerns found in the diff. Empty array if none.",
    },
    missing_tests: {
      type: "array",
      items: { type: "string" },
      description:
        "Areas of the change that appear to lack test coverage. Empty array if none.",
    },
  },
  required: ["summary", "risk_level", "verdict", "risks", "missing_tests"],
  additionalProperties: false,
} as const;

function buildPrompt(params: {
  repo: string;
  prNumber: number;
  prTitle: string;
  diff: string;
}): string {
  const truncated =
    params.diff.length > MAX_DIFF_CHARS
      ? params.diff.slice(0, MAX_DIFF_CHARS) +
        "\n\n... (diff truncated for length — review the visible portion) ..."
      : params.diff;

  return `You are an experienced senior software engineer performing a pull request code review.

Repository: ${params.repo}
PR #${params.prNumber}: ${params.prTitle}

Review the unified diff below. Summarize what the change does, flag any
concrete risks, bugs, or edge cases you can see in the diff, and note any
parts of the change that look like they're missing test coverage.

Be specific — reference file names and describe the actual issue, not
generic advice like "add more tests" without saying where. If the diff
looks safe, small, and well covered, say so plainly and keep the risk
level low. Reserve "high" for changes that could break production, touch
auth/security/payment paths, or make broad, hard-to-review changes.

\`\`\`diff
${truncated}
\`\`\``;
}

export async function reviewDiff(params: {
  repo: string;
  prNumber: number;
  prTitle: string;
  diff: string;
}): Promise<{ review: ReviewResult; rawResponseText: string }> {
  const response = await anthropic.messages.create({
    model: config.claudeModel,
    max_tokens: 2048,
    // This is a bounded extraction/review task, not open-ended reasoning —
    // disable thinking for lower latency and cost on the webhook path.
    thinking: { type: "disabled" },
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: REVIEW_SCHEMA,
      },
    },
    messages: [{ role: "user", content: buildPrompt(params) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to review this diff (safety refusal).");
  }

  const textBlock = response.content.find(
    (block): block is Anthropic.TextBlock => block.type === "text",
  );

  if (!textBlock) {
    throw new Error("Claude response did not contain a text block to parse.");
  }

  const review = JSON.parse(textBlock.text) as ReviewResult;
  return { review, rawResponseText: textBlock.text };
}
