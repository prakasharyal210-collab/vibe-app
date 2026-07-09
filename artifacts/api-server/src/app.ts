import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import * as Sentry from "@sentry/node";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "150mb" }));
app.use(express.urlencoded({ extended: true, limit: "150mb" }));

// Response-time header — intercepts res.end() so the header is set before flush
app.use((_req, res, next) => {
  const start = Date.now();
  const origEnd = res.end.bind(res) as typeof res.end;
  (res.end as any) = (...args: Parameters<typeof res.end>) => {
    res.setHeader("X-Response-Time", `${Date.now() - start}ms`);
    return origEnd(...args);
  };
  next();
});

// ─── Public branded HTML pages (registered before /api so no auth can block) ─

const CARD_SHELL = (body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Gundruk</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #0f0f13;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      padding: 24px;
    }
    .card {
      background: #1a1a22;
      border-radius: 16px;
      max-width: 480px;
      width: 100%;
      overflow: hidden;
    }
    .top-bar {
      background: linear-gradient(90deg, #8B5CF6, #EC4899, #F97316);
      padding: 20px 24px 16px;
    }
    .brand {
      color: #fff;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: 2px;
    }
    .tagline {
      color: rgba(255,255,255,0.9);
      font-size: 12px;
      margin-top: 2px;
    }
    .body {
      padding: 36px 28px 28px;
      text-align: center;
    }
    .emoji { font-size: 56px; line-height: 1; margin-bottom: 20px; }
    h1 {
      color: #fff;
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 12px;
    }
    p {
      color: #b7b7c2;
      font-size: 15px;
      line-height: 1.6;
    }
    .footer {
      border-top: 1px solid #2c2c38;
      padding: 14px 28px;
      text-align: center;
      color: #6a6a76;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="top-bar">
      <div class="brand">GUNDRUK</div>
      <div class="tagline">Find Your People</div>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">© 2026 Gundruk · gundrukapp.com</div>
  </div>
</body>
</html>`;

app.get("/confirmed", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    CARD_SHELL(`
      <div class="emoji">✅</div>
      <h1>Email confirmed!</h1>
      <p>Your account is ready. Open the Gundruk app to get started.</p>
    `),
  );
});

app.get("/reset-redirect", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    CARD_SHELL(`
      <div class="emoji">✅</div>
      <h1>Password updated ✅</h1>
      <p>Open the Gundruk app and sign in with your new password.</p>
    `),
  );
});

// TEMPORARY — remove after Sentry capture is verified in production.
// Confirms Sentry.setupExpressErrorHandler below actually reports thrown
// errors end-to-end. Registered BEFORE the /api router so its own
// catch-all/404 handler never intercepts this request first.
app.get("/api/debug-sentry-test", () => {
  throw new Error("Sentry test error - safe to ignore, will be removed after verification");
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use("/api", router);

// Must be registered AFTER all routes so it can catch errors thrown inside
// them. If SENTRY_DSN was never set (see src/instrument.ts), Sentry has no
// active client and this call is a safe no-op.
Sentry.setupExpressErrorHandler(app);

export default app;
