import { config } from "./config.js";
import { pool } from "./db.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  try {
    await pool.query("SELECT 1");
    console.log("[db] Connected to Postgres");
  } catch (err) {
    console.error(
      `[db] Could not connect to Postgres at ${config.databaseUrl}. ` +
        "Is `docker compose up -d` running? Continuing to start the server " +
        "anyway — requests that touch the database will fail until it's reachable.",
    );
    console.error(err);
  }

  const app = createServer();

  app.listen(config.port, () => {
    console.log(`ai-pr-reviewer listening on http://localhost:${config.port}`);

    if (!config.githubWebhookSecret) {
      console.warn(
        "[config] GITHUB_WEBHOOK_SECRET is not set — every webhook request will be rejected with 401.",
      );
    }
    if (!config.githubToken) {
      console.warn(
        "[config] GITHUB_TOKEN is not set — fetching PR diffs and posting comments will fail.",
      );
    }
    if (!config.anthropicApiKey) {
      console.warn(
        "[config] ANTHROPIC_API_KEY is not set — Claude review calls will fail.",
      );
    }
  });
}

main().catch((err) => {
  console.error("[fatal] Failed to start server:", err);
  process.exit(1);
});
