import * as Sentry from "@sentry/node";

/**
 * Sentry must be initialized before any other module is imported so its
 * auto-instrumentation (http, express, etc.) can hook in correctly. This file
 * is imported as the very first line of src/index.ts for that reason — do
 * not reorder it.
 *
 * SENTRY_DSN must be added to Railway's environment variables manually
 * (create a project at sentry.io, copy its DSN). If SENTRY_DSN is not set,
 * Sentry.init() is simply never called — every Sentry.* call elsewhere
 * becomes a safe no-op, so the app boots and runs normally without it.
 */
const dsn = process.env["SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env["NODE_ENV"] ?? "development",
    tracesSampleRate: 0.2,
  });
}
