/**
 * seed-mia-vibe.mts
 *
 * Creates a second demo profile for the Find Vibe deck.
 * - Uploads 4 photos to Supabase storage (avatars bucket)
 * - Inserts into auth.users (service-role admin call)
 * - Inserts into public.profiles with show_in_matching = true
 *
 * Run:
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *     pnpm --filter @workspace/scripts run seed-mia-vibe
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

const MIA_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a17";
const MIA_EMAIL = "mia.demo@gundrukapp.com";

const IMAGE_FILES = [
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_50_47_AM_1784040902061.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_51_56_AM_1784040902060.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_53_23_AM_1784040902060.png",
  "attached_assets/ChatGPT_Image_Jul_15,_2026,_12_54_30_AM_1784040902058.png",
];

async function uploadImages(): Promise<string[]> {
  console.log("📸  Uploading photos to Supabase storage...");
  const urls: string[] = [];

  for (let i = 0; i < IMAGE_FILES.length; i++) {
    const relPath = IMAGE_FILES[i]!;
    const absPath = path.resolve(__dirname, "../..", relPath);
    const storageKey = `mia-vibe/photo-${i + 1}.png`;

    if (!fs.existsSync(absPath)) {
      console.warn(`  ⚠️  File not found: ${absPath} — skipping`);
      continue;
    }

    const buffer = fs.readFileSync(absPath);
    const { error } = await sb.storage
      .from("avatars")
      .upload(storageKey, buffer, { contentType: "image/png", upsert: true });

    if (error) {
      console.error(`  ❌  Upload failed for photo ${i + 1}:`, error.message);
      continue;
    }

    const { data: pub } = sb.storage.from("avatars").getPublicUrl(storageKey);
    console.log(`  ✅  photo-${i + 1} → ${pub.publicUrl}`);
    urls.push(pub.publicUrl);
  }

  return urls;
}

async function createAuthUser() {
  console.log("👤  Creating auth.users entry...");
  const { error } = await sb.auth.admin.createUser({
    email: MIA_EMAIL,
    password: "GundrukSeed!2024",
    email_confirm: true,
    user_metadata: { username: "mia.wanders" },
    // @ts-expect-error – supabase-js doesn't type id but service-role supports it
    id: MIA_ID,
  });
  if (
    error &&
    !error.message.includes("already been registered") &&
    !error.message.includes("already exists")
  ) {
    console.error("  ❌  auth.users error:", error.message);
  } else {
    console.log("  ✅  auth.users ok");
  }
}

async function insertProfile(photoUrls: string[]) {
  console.log("📋  Inserting public.profiles...");

  const { error } = await sb.from("profiles").upsert(
    {
      id: MIA_ID,
      username: "mia.wanders",
      full_name: "Mia Nguyen",
      bio: "chronic traveller ✈️ | Paris → Santorini → wherever next | art museums and late-night dinner walks",
      age: 23,
      gender: "female",
      location: "New York, NY",
      avatar_url: photoUrls[0] ?? null,

      show_in_matching: true,
      find_gundruk_mode: "active",

      vibe_bio: "Tell me your favourite city and I'll tell you if we'd get along 🗺️ Looking for a travel partner and maybe something more",
      vibe_profile_photo_url: photoUrls[0] ?? null,
      vibe_photos: photoUrls,

      vibe_zodiac: "Pisces",
      vibe_education: "Bachelor's",
      vibe_family_plans: "Someday",
      vibe_communication: "Quality time",
      vibe_love_style: "Acts of service",
      vibe_pets: "Cat person 🐱",
      vibe_drinking: "Socially",
      vibe_smoking: "Never",
      vibe_cannabis: "Never",
      vibe_workout: "Sometimes",

      relationship_goal: "Dating",
      relationship_goals: ["Dating", "Something serious"],
      interests: ["travel", "art", "photography", "food", "architecture", "sunsets", "museums"],
      zodiac_sign: "Pisces",
      relationship_status: "Single",

      followers_count: 0,
      following_count: 0,
      posts_count: 0,

      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    { onConflict: "id" }
  );

  if (error) console.error("  ❌  profiles:", error.message);
  else console.log("  ✅  profiles ok — Mia is live in Find Vibe! 🎉");
}

async function main() {
  console.log("🚀  Seeding Mia Nguyen into Find Vibe...\n");

  const photoUrls = await uploadImages();
  if (photoUrls.length === 0) {
    console.error("❌  No images uploaded — aborting profile insert.");
    process.exit(1);
  }

  await createAuthUser();
  await insertProfile(photoUrls);

  console.log("\n✅  Done! Mia (mia.wanders) is now in the Find Vibe deck.");
  console.log(`   UUID: ${MIA_ID}`);
  console.log(`   Photos: ${photoUrls.length} uploaded`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
