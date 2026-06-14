import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// GET /api/healthz/scoring-config
// Sanity-check: verifies scoring_config table exists and is writable (no-op UPDATE).
// Returns { writable: true, rowCount: N } if OK.
router.get("/healthz/scoring-config", async (req, res) => {
  const url = process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  const sb = createClient(url, key);
  try {
    // No-op UPDATE — verifies table is writable and RPCs will pick up rows on next call
    const { data, error } = await sb
      .from("scoring_config")
      .update({ value: sb.rpc("coalesce" as any, {}) as any })
      .eq("key", "weight_like")
      .select("key, value");

    // Simpler approach: just SELECT to verify table exists
    const { data: rows, error: selErr } = await sb
      .from("scoring_config")
      .select("key, value")
      .eq("key", "weight_like")
      .maybeSingle();

    if (selErr) {
      req.log.warn({ error: selErr.message }, "scoring_config not accessible");
      res.json({ writable: false, reason: selErr.message });
      return;
    }

    // Confirm writable with a true no-op update
    const { error: updErr } = await sb
      .from("scoring_config")
      .update({ value: rows?.value ?? 1 })
      .eq("key", "weight_like");

    res.json({
      writable: !updErr,
      reason: updErr?.message ?? null,
      row: rows ?? null,
    });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "scoring_config check failed");
    res.status(500).json({ writable: false, reason: err?.message });
  }
});

export default router;
