-- =====================================================================
-- Vibe Ads System — Supabase Migration
-- Run this in your Supabase SQL editor (Project > SQL Editor > New Query)
-- =====================================================================

-- ─── advertisers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.advertisers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  logo_url      TEXT,
  website       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.advertisers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own advertiser account"
  ON public.advertisers FOR ALL
  USING (auth.uid() = user_id);

-- ─── ad_campaigns ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  advertiser_name  TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  cta_text         TEXT NOT NULL DEFAULT 'Learn More',
  cta_url          TEXT NOT NULL,
  ad_type          TEXT NOT NULL DEFAULT 'feed_post' CHECK (ad_type IN ('feed_post','reel')),
  daily_budget     NUMERIC(10,2) NOT NULL DEFAULT 10,
  duration_days    INT NOT NULL DEFAULT 7,
  total_spent      NUMERIC(10,2) NOT NULL DEFAULT 0,
  target_gender    TEXT DEFAULT 'all' CHECK (target_gender IN ('all','male','female')),
  status           TEXT NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review','active','paused','completed','rejected')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ
);

ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own campaigns"
  ON public.ad_campaigns FOR ALL
  USING (auth.uid() = user_id);

-- ─── ads ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  advertiser_name   TEXT NOT NULL,
  advertiser_avatar TEXT,
  title             TEXT NOT NULL,
  description       TEXT,
  media_url         TEXT,
  cta_text          TEXT NOT NULL DEFAULT 'Learn More',
  cta_url           TEXT NOT NULL,
  ad_type           TEXT NOT NULL DEFAULT 'feed_post' CHECK (ad_type IN ('feed_post','reel')),
  impressions_count BIGINT NOT NULL DEFAULT 0,
  clicks_count      BIGINT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view active ads
CREATE POLICY "Anyone can view active ads"
  ON public.ads FOR SELECT
  USING (status = 'active');

-- ─── ad_impressions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_impressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id           UUID REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  impression_type TEXT NOT NULL DEFAULT 'view' CHECK (impression_type IN ('view','reel_view')),
  watch_duration  INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own impressions"
  ON public.ad_impressions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── ad_clicks ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_clicks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id      UUID REFERENCES public.ads(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own clicks"
  ON public.ad_clicks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ─── hidden_ads ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hidden_ads (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ad_id      UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ad_id)
);

ALTER TABLE public.hidden_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own hidden ads"
  ON public.hidden_ads FOR ALL
  USING (auth.uid() = user_id);

-- ─── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ads_status     ON public.ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_ad_type    ON public.ads(ad_type, status);
CREATE INDEX IF NOT EXISTS idx_hidden_ads_uid ON public.hidden_ads(user_id);
CREATE INDEX IF NOT EXISTS idx_impressions_ad ON public.ad_impressions(ad_id);
CREATE INDEX IF NOT EXISTS idx_clicks_ad      ON public.ad_clicks(ad_id);

-- ─── RPC: get_feed_ads ────────────────────────────────────────────────
-- Returns active ads not hidden by the user, for the given ad type
CREATE OR REPLACE FUNCTION public.get_feed_ads(
  p_user_id UUID,
  p_ad_type TEXT DEFAULT 'feed_post',
  p_limit   INT  DEFAULT 5
)
RETURNS TABLE (
  ad_id             UUID,
  advertiser_name   TEXT,
  advertiser_avatar TEXT,
  title             TEXT,
  description       TEXT,
  media_url         TEXT,
  cta_text          TEXT,
  cta_url           TEXT,
  ad_type           TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    a.id             AS ad_id,
    a.advertiser_name,
    a.advertiser_avatar,
    a.title,
    a.description,
    a.media_url,
    a.cta_text,
    a.cta_url,
    a.ad_type
  FROM public.ads a
  WHERE a.status   = 'active'
    AND a.ad_type  = p_ad_type
    AND NOT EXISTS (
      SELECT 1 FROM public.hidden_ads h
      WHERE h.user_id = p_user_id
        AND h.ad_id   = a.id
    )
  ORDER BY random()
  LIMIT p_limit;
$$;

-- ─── RPC: track_ad_impression ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_ad_impression(
  p_ad_id          UUID,
  p_user_id        UUID,
  p_impression_type TEXT DEFAULT 'view',
  p_watch_duration  INT  DEFAULT 0
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ad_impressions (ad_id, user_id, impression_type, watch_duration)
  VALUES (p_ad_id, p_user_id, p_impression_type, p_watch_duration);

  UPDATE public.ads
  SET impressions_count = impressions_count + 1
  WHERE id = p_ad_id;
END;
$$;

-- ─── RPC: track_ad_click ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_ad_click(
  p_ad_id   UUID,
  p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ad_clicks (ad_id, user_id)
  VALUES (p_ad_id, p_user_id);

  UPDATE public.ads
  SET clicks_count = clicks_count + 1
  WHERE id = p_ad_id;
END;
$$;

-- ─── Grant execute on RPCs ────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.get_feed_ads TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.track_ad_impression TO authenticated;
GRANT EXECUTE ON FUNCTION public.track_ad_click TO authenticated;
