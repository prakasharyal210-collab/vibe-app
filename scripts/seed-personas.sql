-- =============================================================================
-- Gundruk — Seed Personas (15 accounts)
-- =============================================================================
-- RUN IN: Supabase Dashboard → SQL Editor → New query
-- DO NOT run against local Drizzle DB — this targets Supabase auth + public schemas.
-- DO NOT run in production until all 3 weeks of content has been reviewed.
--
-- What this file does
--   1. Inserts 15 rows into auth.users  (Supabase Auth — allows service-role ops)
--   2. Inserts 15 rows into public.users (required by couple_links FK REFERENCES users(id))
--   3. Inserts 15 rows into public.profiles (what the app reads everywhere)
--   4. Creates 2 accepted couple_links rows (personas 5+6, personas 14+15)
--   5. Runs a verification SELECT at the end
--
-- All persona accounts:  show_in_matching = FALSE  →  never appear in Find Vibe deck
-- Password for every persona: GundrukSeed!2024  (bcrypt via pgcrypto)
--
-- FIXED UUIDs (copy these into seed-content-batch.json persona references):
--   p01 (Aarav / momoking_ktm)      : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01
--   p02 (Riya / sydneydarling_np)   : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02
--   p03 (Bikash / pokharapeaks)     : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03
--   p04 (Suraj / desi_chaos_np)     : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04
--   p05 (Priya Rai / priya.rai.np)  : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05
--   p06 (Rohan Rai / rohanrai.life) : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06
--   p07 (Aakash / aakash_eleven)    : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07
--   p08 (Anisha / nurse_anisha_ca)  : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08
--   p09 (Sagar / lopdohori_sagar)   : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09
--   p10 (Nisha / nisha.thrifts)     : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10
--   p11 (Kiran / kiran_in_london)   : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11
--   p12 (Deepak / deepak_gainz)     : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12
--   p13 (Smriti / chiyaandthoughts) : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13
--   p14 (Sunita / sunita.melb)      : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14
--   p15 (Nabin / nabin.melb)        : a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15
--   couple_link 1 (p05+p06)         : c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01
--   couple_link 2 (p14+p15)         : c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. auth.users
--    pgcrypto must be enabled (it is by default on Supabase).
--    ON CONFLICT DO NOTHING makes this re-runnable.
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, confirmation_sent_at,
  raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous,
  created_at, updated_at
) VALUES
-- p01 Aarav Shrestha — Kathmandu foodie
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  'authenticated', 'authenticated',
  'persona1@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '21 days', NOW() - INTERVAL '21 days'
),
-- p02 Riya Gurung — Sydney student
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
  'authenticated', 'authenticated',
  'persona2@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '19 days 8 hours', NOW() - INTERVAL '19 days 8 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '19 days 8 hours', NOW() - INTERVAL '19 days 8 hours'
),
-- p03 Bikash Tamang — trekking photographer
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
  'authenticated', 'authenticated',
  'persona3@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '18 days', NOW() - INTERVAL '18 days'
),
-- p04 Suraj Bhattarai — meme lord
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
  'authenticated', 'authenticated',
  'persona4@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '16 days 12 hours', NOW() - INTERVAL '16 days 12 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '16 days 12 hours', NOW() - INTERVAL '16 days 12 hours'
),
-- p05 Priya Rai — newly-married wife (couple 1)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
  'authenticated', 'authenticated',
  'persona5@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'
),
-- p06 Rohan Rai — newly-married husband (couple 1)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
  'authenticated', 'authenticated',
  'persona6@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'
),
-- p07 Aakash Limbu — cricket/football fanatic
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07',
  'authenticated', 'authenticated',
  'persona7@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '13 days 4 hours', NOW() - INTERVAL '13 days 4 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '13 days 4 hours', NOW() - INTERVAL '13 days 4 hours'
),
-- p08 Anisha Karki — Toronto nurse
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08',
  'authenticated', 'authenticated',
  'persona8@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '11 days 8 hours', NOW() - INTERVAL '11 days 8 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '11 days 8 hours', NOW() - INTERVAL '11 days 8 hours'
),
-- p09 Sagar Pandey — music guy
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09',
  'authenticated', 'authenticated',
  'persona9@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'
),
-- p10 Nisha Thapa — fashion/thrift girl
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  'authenticated', 'authenticated',
  'persona10@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '8 days 16 hours', NOW() - INTERVAL '8 days 16 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '8 days 16 hours', NOW() - INTERVAL '8 days 16 hours'
),
-- p11 Kiran Adhikari — London techie
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'authenticated', 'authenticated',
  'persona11@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'
),
-- p12 Deepak Magar — gym bro
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'authenticated', 'authenticated',
  'persona12@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '5 days 8 hours', NOW() - INTERVAL '5 days 8 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '5 days 8 hours', NOW() - INTERVAL '5 days 8 hours'
),
-- p13 Smriti Basnet — chiya addict / philosophy poster
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
  'authenticated', 'authenticated',
  'persona13@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'
),
-- p14 Sunita Poudel — Melbourne cafe couple A
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
  'authenticated', 'authenticated',
  'persona14@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '2 days 12 hours', NOW() - INTERVAL '2 days 12 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '2 days 12 hours', NOW() - INTERVAL '2 days 12 hours'
),
-- p15 Nabin Maharjan — Melbourne cafe couple B
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15',
  'authenticated', 'authenticated',
  'persona15@gundrukapp.com',
  crypt('GundrukSeed!2024', gen_salt('bf')),
  NOW() - INTERVAL '2 days 12 hours', NOW() - INTERVAL '2 days 12 hours',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  false, false,
  NOW() - INTERVAL '2 days 12 hours', NOW() - INTERVAL '2 days 12 hours'
)
ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 2. public.profiles
--    Avatar URLs use ui-avatars.com as temporary placeholders.
--    Replace with real CDN URLs before launch.
--    show_in_matching = FALSE on all personas — never in Find Vibe deck.
-- ---------------------------------------------------------------------------

INSERT INTO public.profiles (
  id, username, full_name, bio, age, gender, location,
  avatar_url, show_in_matching, relationship_status,
  followers_count, following_count, posts_count,
  created_at
) VALUES

-- p01: Kathmandu foodie
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  'momoking_ktm',
  'Aarav Shrestha',
  'Kathmandu food guy. I review momos so you don''t have to. Currently rating every jhol spot in Thamel. DM me your hidden gems 🫦',
  24, 'male', 'Kathmandu',
  'https://ui-avatars.com/api/?name=Aarav+Shrestha&background=1A0A2E&color=E2A84B&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '21 days'
),

-- p02: Sydney student
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
  'sydneydarling_np',
  'Riya Gurung',
  '2nd yr @ UNSW | Sydney मा पढ्दैछु, घर सम्झिंदैछु 🍃 trying to adult while crying at momo prices here',
  21, 'female', 'Sydney, Australia',
  'https://ui-avatars.com/api/?name=Riya+Gurung&background=1A0A2E&color=C084FC&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '19 days 8 hours'
),

-- p03: Trekking photographer
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
  'pokharapeaks',
  'Bikash Tamang',
  'landscape + street photographer | based Pokhara 📷 Annapurna is my backyard and I still can''t believe it',
  28, 'male', 'Pokhara',
  'https://ui-avatars.com/api/?name=Bikash+Tamang&background=0D1B2A&color=60B8F7&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '18 days'
),

-- p04: Meme lord
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
  'desi_chaos_np',
  'Suraj Bhattarai',
  'professional shitposter. Nepali internet humour curator. my content has no nutritional value but neither does packaged wai wai',
  23, 'male', 'Kathmandu',
  'https://ui-avatars.com/api/?name=Suraj+Bhattarai&background=1A0A2E&color=F97316&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '16 days 12 hours'
),

-- p05: Newly-married wife (couple 1 with p06)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
  'priya.rai.np',
  'Priya Rai',
  'recently married (2 months ago) and still figuring out what that means 😭 she/her | Lalitpur',
  25, 'female', 'Lalitpur',
  'https://ui-avatars.com/api/?name=Priya+Rai&background=2D0A1F&color=F472B6&size=256&bold=true&format=png',
  false, 'Linked',
  0, 0, 0,
  NOW() - INTERVAL '15 days'
),

-- p06: Newly-married husband (couple 1 with p05)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
  'rohanrai.life',
  'Rohan Rai',
  'husband of @priya.rai.np | engineer by degree, kebab enthusiast by calling | Lalitpur',
  27, 'male', 'Lalitpur',
  'https://ui-avatars.com/api/?name=Rohan+Rai&background=1A0A2E&color=E2A84B&size=256&bold=true&format=png',
  false, 'Linked',
  0, 0, 0,
  NOW() - INTERVAL '15 days'
),

-- p07: Cricket/football fanatic
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07',
  'aakash_eleven',
  'Aakash Limbu',
  'if it''s cricket or football, I''m watching it at 3am. no regrets. based Biratnagar | supporter of chaos',
  26, 'male', 'Biratnagar',
  'https://ui-avatars.com/api/?name=Aakash+Limbu&background=0A1F0A&color=4ADE80&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '13 days 4 hours'
),

-- p08: Toronto nurse
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08',
  'nurse_anisha_ca',
  'Anisha Karki',
  'RN @ Toronto General | diaspora nurse things ☕ — 12hr shifts, biryani sundays, calling ama every night',
  29, 'female', 'Toronto, Canada',
  'https://ui-avatars.com/api/?name=Anisha+Karki&background=1A0A2E&color=C084FC&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '11 days 8 hours'
),

-- p09: Music guy
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09',
  'lopdohori_sagar',
  'Sagar Pandey',
  'music is my whole personality | nepali folk to hip hop pipeline | running a playlist no one asked for',
  25, 'male', 'Kathmandu',
  'https://ui-avatars.com/api/?name=Sagar+Pandey&background=1A0A2E&color=A78BFA&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '10 days'
),

-- p10: Fashion/thrift girl
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  'nisha.thrifts',
  'Nisha Thapa',
  'thrift queen of Kathmandu | sustainable fashion isn''t optional it''s a vibe | Asan market every saturday',
  23, 'female', 'Kathmandu',
  'https://ui-avatars.com/api/?name=Nisha+Thapa&background=2D0A1F&color=FB7185&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '8 days 16 hours'
),

-- p11: London techie
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'kiran_in_london',
  'Kiran Adhikari',
  'software dev | London | coding by day, missing dal bhat by night. yes I pay £4 for a coffee. yes I hate myself.',
  30, 'male', 'London, UK',
  'https://ui-avatars.com/api/?name=Kiran+Adhikari&background=0D1B2A&color=60B8F7&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '7 days'
),

-- p12: Gym bro
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'deepak_gainz',
  'Deepak Magar',
  'gym is my temple | Dubai life | desi gains humor | bro don''t skip dal bhat it''s literally protein',
  27, 'male', 'Dubai, UAE',
  'https://ui-avatars.com/api/?name=Deepak+Magar&background=1A0A2E&color=F97316&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '5 days 8 hours'
),

-- p13: Chiya / philosophy poster
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
  'chiyaandthoughts',
  'Smriti Basnet',
  'chiya > coffee. i think therefore i overthink. chitwan mau | philosophy degree dropout who still argues like she has one',
  24, 'female', 'Chitwan',
  'https://ui-avatars.com/api/?name=Smriti+Basnet&background=1A100A&color=FCD34D&size=256&bold=true&format=png',
  false, 'Single',
  0, 0, 0,
  NOW() - INTERVAL '4 days'
),

-- p14: Melbourne cafe couple A (couple 2 with p15)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
  'sunita.melb',
  'Sunita Poudel',
  'barista + cafe hop addict | Melbourne | I moved here for study and stayed for the coffee culture and Nabin',
  26, 'female', 'Melbourne, Australia',
  'https://ui-avatars.com/api/?name=Sunita+Poudel&background=2D0A1F&color=F472B6&size=256&bold=true&format=png',
  false, 'Linked',
  0, 0, 0,
  NOW() - INTERVAL '2 days 12 hours'
),

-- p15: Melbourne cafe couple B (couple 2 with p14)
(
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15',
  'nabin.melb',
  'Nabin Maharjan',
  '@sunita.melb''s person | software dev Melbourne | cooking dal bhat on Sundays trying to impress her family on video call',
  28, 'male', 'Melbourne, Australia',
  'https://ui-avatars.com/api/?name=Nabin+Maharjan&background=1A0A2E&color=60B8F7&size=256&bold=true&format=png',
  false, 'Linked',
  0, 0, 0,
  NOW() - INTERVAL '2 days 12 hours'
)

ON CONFLICT (id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 4. couple_links
--    status = 'accepted', accepted_at set so the app recognises the link.
--    Couple 1: Priya Rai (p05) + Rohan Rai (p06)
--    Couple 2: Sunita Poudel (p14) + Nabin Maharjan (p15)
-- ---------------------------------------------------------------------------

INSERT INTO public.couple_links (
  id, requester_id, receiver_id, status, created_at, accepted_at
) VALUES
(
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
  'accepted',
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '14 days'
),
(
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15',
  'accepted',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (requester_id, receiver_id) DO NOTHING;


-- ---------------------------------------------------------------------------
-- 5. Update profiles.couple_id for the linked personas
-- ---------------------------------------------------------------------------

UPDATE public.profiles
SET couple_id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01'
WHERE id IN (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06'
);

UPDATE public.profiles
SET couple_id = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02'
WHERE id IN (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15'
);


COMMIT;


-- ---------------------------------------------------------------------------
-- 6. Verification — run this after COMMIT to confirm everything landed
-- ---------------------------------------------------------------------------

SELECT
  p.id,
  p.username,
  p.full_name,
  p.location,
  p.show_in_matching,
  p.relationship_status,
  p.couple_id,
  a.email,
  a.email_confirmed_at IS NOT NULL AS auth_confirmed,
  p.created_at::date AS joined_date
FROM public.profiles p
JOIN auth.users a ON a.id = p.id
WHERE p.id IN (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a01',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a02',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a03',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a04',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a05',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a06',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a07',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a08',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a09',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a10',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15'
)
ORDER BY p.created_at;

-- Expected: 15 rows, show_in_matching = false on all, couple_id set on p05/p06/p14/p15
SELECT
  cl.id AS couple_link_id,
  cl.status,
  r.username AS requester,
  v.username AS receiver,
  cl.accepted_at::date AS accepted_date
FROM public.couple_links cl
JOIN public.profiles r ON r.id = cl.requester_id
JOIN public.profiles v ON v.id = cl.receiver_id
WHERE cl.id IN (
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c01',
  'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380c02'
);
-- Expected: 2 rows, both status = 'accepted'
