/**
 * Thin wrapper around @sentry/react-native.
 *
 * Why lazy `require` + try/catch instead of a static import:
 *   @sentry/react-native ships native modules that are NOT present in the
 *   standard Expo Go client (only in a custom dev client / EAS build). A
 *   static top-level import can throw during bundling/boot inside Expo Go.
 *   Requiring it lazily inside a try/catch means a missing native module
 *   degrades to a silent no-op instead of crashing the whole app — same
 *   contract as "EXPO_PUBLIC_SENTRY_DSN missing → no-op".
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SentryModule: any = null;

const dsn = process.env["EXPO_PUBLIC_SENTRY_DSN"];

export function initSentry(): void {
  if (!dsn) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require("@sentry/react-native");
    SentryModule = Sentry;
    Sentry.init({
      dsn,
      tracesSampleRate: 0.2,
      environment: process.env["EXPO_PUBLIC_APP_ENV"] ?? "development",
    });
  } catch (err) {
    console.warn("[Sentry] init failed, continuing without crash reporting:", err);
  }
}

export function captureException(error: unknown): void {
  try {
    SentryModule?.captureException(error);
  } catch {
    // Never let error reporting itself crash the app.
  }
}
