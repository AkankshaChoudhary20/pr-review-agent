/**
 * Sends a synthetic, correctly-shaped `pull_request` webhook payload to a
 * running instance of the server and checks that:
 *
 *   1. A correctly-signed request is accepted (200/202).
 *   2. A request signed with the wrong secret is rejected (401).
 *   3. A request with no signature header at all is rejected (401).
 *
 * This does NOT require a real GitHub repo, a valid GITHUB_TOKEN, or a valid
 * ANTHROPIC_API_KEY — it only exercises the HMAC signature verification in
 * the webhook route. (If GITHUB_TOKEN / ANTHROPIC_API_KEY *are* configured,
 * the server will also attempt a real review in the background — check its
 * logs.)
 *
 * Usage:
 *   npm run dev                      # in one terminal
 *   npm run test:webhook             # in another
 *
 * Reads GITHUB_WEBHOOK_SECRET and PORT from the environment (same .env the
 * server uses), falling back to sensible defaults for local testing.
 */
import crypto from "crypto";
import http from "http";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const PORT = process.env.PORT || "3000";
const SECRET = process.env.GITHUB_WEBHOOK_SECRET || "test-secret";
const HOST = `http://localhost:${PORT}`;

const samplePayload = {
  action: "opened",
  number: 1,
  pull_request: {
    number: 1,
    title: "Add retry logic to the payment webhook handler",
    html_url: "https://github.com/example/example-repo/pull/1",
    user: { login: "octocat" },
  },
  repository: {
    name: "example-repo",
    full_name: "example/example-repo",
    owner: { login: "example" },
  },
};

function sign(body: string, secret: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function post(
  body: string,
  signature: string | null,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${HOST}/webhook/github`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-GitHub-Event": "pull_request",
          ...(signature ? { "X-Hub-Signature-256": signature } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: data }));
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main(): Promise<void> {
  const body = JSON.stringify(samplePayload);
  let failures = 0;

  console.log(`Testing ${HOST}/webhook/github`);
  console.log(
    `Using GITHUB_WEBHOOK_SECRET=${
      process.env.GITHUB_WEBHOOK_SECRET ? "(from environment)" : `"${SECRET}" (default — set GITHUB_WEBHOOK_SECRET to match your server)`
    }\n`,
  );

  // 1. Correctly signed request
  const validSig = sign(body, SECRET);
  const validResult = await post(body, validSig);
  console.log("[1] valid signature   -> status", validResult.status, validResult.body);
  if (validResult.status !== 200 && validResult.status !== 202) {
    console.error("    FAIL: expected 200 or 202 for a correctly signed payload");
    failures++;
  } else {
    console.log("    OK");
  }

  // 2. Wrong secret
  const wrongSig = sign(body, SECRET + "-wrong");
  const wrongResult = await post(body, wrongSig);
  console.log("\n[2] wrong secret      -> status", wrongResult.status, wrongResult.body);
  if (wrongResult.status !== 401) {
    console.error("    FAIL: expected 401 for a payload signed with the wrong secret");
    failures++;
  } else {
    console.log("    OK");
  }

  // 3. No signature header at all
  const missingResult = await post(body, null);
  console.log("\n[3] missing signature -> status", missingResult.status, missingResult.body);
  if (missingResult.status !== 401) {
    console.error("    FAIL: expected 401 when X-Hub-Signature-256 is absent");
    failures++;
  } else {
    console.log("    OK");
  }

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("Test script errored — is the server running (npm run dev)?\n", err);
  process.exitCode = 1;
});
