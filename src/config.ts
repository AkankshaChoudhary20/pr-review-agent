import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/ai_pr_reviewer",

  githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || "",
  githubToken: process.env.GITHUB_TOKEN || "",

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  claudeModel: process.env.CLAUDE_MODEL || "claude-sonnet-5",
};

export type AppConfig = typeof config;
