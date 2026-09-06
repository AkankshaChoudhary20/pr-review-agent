import { Request, Response, Router } from "express";
import { config } from "../config.js";
import { verifyGitHubSignature } from "../github.js";
import { isReviewableEvent, processPullRequestEvent } from "../reviewService.js";

export const webhookRouter = Router();

/** Express attaches the raw body here via the `verify` hook in server.ts. */
interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

webhookRouter.post("/webhook/github", (req: RequestWithRawBody, res: Response) => {
  const signature = req.header("x-hub-signature-256");
  const rawBody = req.rawBody;

  if (!rawBody || !verifyGitHubSignature(rawBody, signature, config.githubWebhookSecret)) {
    res.status(401).json({ error: "Invalid or missing webhook signature" });
    return;
  }

  const eventName = req.header("x-github-event");
  const payload = req.body;

  if (!isReviewableEvent(eventName, payload)) {
    res.status(200).json({
      message: `Event ignored (event=${eventName ?? "unknown"}, action=${
        (payload as { action?: string })?.action ?? "unknown"
      })`,
    });
    return;
  }

  // Acknowledge immediately — GitHub expects a fast response and will retry
  // deliveries that time out. The actual review (diff fetch + Claude call +
  // DB write + comment) runs in the background.
  res.status(202).json({ message: "Accepted — review is being generated" });

  processPullRequestEvent(payload).catch((err) => {
    console.error("[webhook] Failed to process pull_request event:", err);
  });
});
