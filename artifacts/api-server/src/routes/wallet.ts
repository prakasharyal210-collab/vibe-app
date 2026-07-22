import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

const router = Router();

function makeSupabase() {
  return createClient(
    process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "https://tatroqgcyebuqqkhmvpa.supabase.co",
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "",
  );
}

// ─── GET /api/wallet/balance?userId=<uuid> ───────────────────────────────────
// Returns: { coins: number, transactions: CoinTransaction[] }
router.get("/balance", async (req, res) => {
  const userId = req.query["userId"] as string | undefined;
  if (!userId) { res.status(400).json({ error: "userId required" }); return; }

  const sb = makeSupabase();
  try {
    // Coins balance from the existing wallet table
    const { data: walletRow } = await sb
      .from("wallet")
      .select("coins")
      .eq("user_id", userId)
      .maybeSingle();

    const coins: number = (walletRow as any)?.coins ?? 0;

    // Last 20 coin transactions (most recent first)
    const { data: txRows } = await sb
      .from("coin_transactions")
      .select(`
        id, amount, reason, created_at,
        related_user:related_user_id (username, avatar_url)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    res.json({ coins, transactions: txRows ?? [] });
  } catch (err: any) {
    req.log.error({ err: err?.message }, "wallet/balance error");
    res.status(500).json({ error: "Failed to fetch wallet" });
  }
});

export default router;
