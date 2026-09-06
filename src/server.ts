import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import { reviewsRouter } from "./routes/reviews.js";
import { webhookRouter } from "./routes/webhook.js";

// __dirname isn't available in native ESM — derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  app.use(
    express.json({
      limit: "10mb",
      // Capture the raw bytes GitHub actually sent so the webhook route can
      // verify the HMAC signature — express.json() would otherwise leave us
      // with only the parsed (and possibly re-serialized) object, whose
      // bytes may not match what GitHub signed.
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as Request & { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  app.use(webhookRouter);
  app.use(reviewsRouter);

  // Static dashboard (no build step) — served last so /health, /webhook/*,
  // and /reviews* above take priority over the static file fallback.
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.use((req: Request, res: Response) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  // Express only recognizes this as an error handler because it has 4 args.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
