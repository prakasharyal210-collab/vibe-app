/**
 * seed-sofia-vibe.mts
 *
 * Creates a demo "Sofia" profile for the Find Vibe deck.
 * - Uploads 5 photos to Supabase storage (avatars bucket)
 * - Inserts into auth.users (service-role admin call)
 * - Inserts into public.users + public.profiles with show_in_matching = true
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --filter @workspace/scripts exec tsx scripts/src/seed-sofia-vibe.mts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ??
  process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
  "https://tatroqgcyebuqqkhmvpa.supabase.co";

const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

if (!SERVICE_KEY) {
  console.error("❌  SUPABASE_SERVICE_ROLE_KEY is not set");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SOFIA_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a16";
const SOFIA_EMAIL = "sofia.demo@gundrukapp.com";

// Paths to the 5 attached images (relative to workspace root)
const IMAGE_FILES = [
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_22_47_AM_1784039672416.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_24_22_AM_1784039672416.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_25_59_AM_1784039672415.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_27_23_AM_1784039672415.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_33_59_AM_1784039672413.png",
];

async function uploadImages(): Promise<string[]> {
  console.log("📸  Uploading photos to Supabase storage...");
  const urls: string[] = [];

  for (let i = 0; i < IMAGE_FILES.length; i++) {
    const relPath = IMAGE_FILES[i]!;
    // Resolve relative to workspace root (scripts/src/ → ../../../)
    const absPath = path.resolve(__dirname, "../..", relPath);
    const storageKey = `sofia-vibe/photo-${i + 1}.png`;

    if (!fs.existsSync(absPath)) {
      console.warn(`  ⚠️  File not found: ${absPath} — skipping`);
      continue;
    }

    const buffer = fs.readFileSync(absPath);
    const { error } = await sb.storage
      .from("avatars")
      .upload(storageKey, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      console.error(`  ❌  Upload failed for photo ${i + 1}:`, error.message);
      continue;
    }

    const { data: pub } = sb.storage
      .from("avatars")
      .getPublicUrl(storageKey);

    console.log(`  ✅  photo-${i + 1} → ${pub.publicUrl}`);
    urls.push(pub.publicUrl);
  }

  return urls;
}

async function createAuthUser() {
  console.log("👤  Creating auth.users entry...");
  const { error } = await sb.auth.admin.createUser({
    email: SOFIA_EMAIL,
    password: "GundrukSeed!2024",
    email_confirm: true,
    user_metadata: { username: "sofia.vibes" },
    // @ts-expect-error – supabase-js doesn't type id but service-role supports it
    id: SOFIA_ID,
  });
  if (error && !error.message.includes("already been registered") && !error.message.includes("already exists")) {
    console.error("  ❌  auth.users error:", error.message);
  } else {
    console.log("  ✅  auth.users ok");
  }
}

async function insertProfile(photoUrls: string[]) {
  console.log("📋  Inserting public.profiles...");

  const avatar = photoUrls[0] ?? null;

  const { error } = await sb.from("profiles").upsert(
    {
      id: SOFIA_ID,
      username: "sofia.vibes",
      full_name: "Sofia Reyes",
      bio: "beach > city. coffee girl. sun-chaser ☀️ | LA based | travel is my love language",
      age: 24,
      gender: "female",
      location: "Los Angeles, CA",
      avatar_url: avatar,

      // ── Find Vibe columns ─────────────────────────────────────────────
      show_in_matching: true,
      find_gundruk_mode: "active",

      // Vibe-specific profile content
      vibe_bio: "Looking for someone who's down to watch sunsets and try every taco spot in LA 🌮✨",
      vibe_profile_photo_url: photoUrls[0] ?? null,
      vibe_photos: photoUrls,

      // Lifestyle tags
      vibe_zodiac: "Scorpio",
      vibe_education: "Bachelor's",
      vibe_family_plans: "Open to it",
      vibe_communication: "Words of affirmation",
      vibe_love_style: "Quality time",
      vibe_pets: "Dog lover 🐶",
      vibe_drinking: "Socially",
      vibe_smoking: "Never",
      vibe_cannabis: "Sometimes",
      vibe_workout: "Often",

      // Matching preferences
      relationship_goal: "Dating",
      relationship_goals: ["Dating", "Something serious"],
      interests: ["travel", "photography", "coffee", "beach", "sunsets", "yoga", "food"],
      zodiac_sign: "Scorpio",
      relationship_status: "Single",

      // Social counts
      followers_count: 0,
      following_count: 0,
      posts_count: 0,

      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) console.error("  ❌  profiles:", error.message);
  else console.log("  ✅  profiles ok — Sofia is live in Find Vibe! 🎉");
}

async function main() {
  console.log("🚀  Seeding Sofia Reyes into Find Vibe...\n");

  const photoUrls = await uploadImages();
  if (photoUrls.length === 0) {
    console.error("❌  No images uploaded — aborting profile insert.");
    process.exit(1);
  }

  await createAuthUser();
  await insertProfile(photoUrls);

  console.log("\n✅  Done! Sofia (sofia.vibes) is now in the Find Vibe deck.");
  console.log(`   UUID: ${SOFIA_ID}`);
  console.log(`   Photos: ${photoUrls.length} uploaded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
