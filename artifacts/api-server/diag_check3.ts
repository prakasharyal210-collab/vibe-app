import { makeSupabase } from "./src/lib/supabase.ts";

async function main() {
  const sb = makeSupabase();
  const { data: authUsers } = await (sb as any).auth.admin.listUsers({ perPage: 200 });
  const authIds = new Set(authUsers.users.map((u: any) => u.id));

  const { data: profiles } = await sb.from("profiles").select("id, username, posts_count, followers_count, following_count");
  const profOrphans = (profiles ?? []).filter((p: any) => !authIds.has(p.id));
  console.log("profiles with NO matching auth.users row:", profOrphans.length);
  profOrphans.forEach((p: any) => console.log("  ", p.id, p.username, "posts_count:", p.posts_count, "followers:", p.followers_count));

  console.log("--- all auth users ---");
  authUsers.users.forEach((u: any) => console.log(u.id, u.email, u.created_at, u.last_sign_in_at));
}
main().then(() => process.exit(0)).catch((e) => { console.log("FATAL", e); process.exit(1); });
