import { Linking } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";

export interface AdItem {
  ad_id: string;
  advertiser_name: string;
  advertiser_avatar?: string | null;
  title: string;
  description: string;
  media_url?: string | null;
  cta_text: string;
  cta_url: string;
  ad_type?: "feed_post" | "reel";
  isAd: true;
  isHouseAd?: boolean;
}

export const HOUSE_ADS: AdItem[] = [
  {
    ad_id: "house-1",
    advertiser_name: "Vibe",
    title: "Get Verified on Vibe ✅",
    description: "Stand out with a verified badge. Apply today!",
    media_url: null,
    cta_text: "Apply Now",
    cta_url: "vibe://verification",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "house-2",
    advertiser_name: "Vibe",
    title: "Buy Coins & Send Gifts 🎁",
    description: "Support your favourite creators with coins",
    media_url: null,
    cta_text: "Get Coins",
    cta_url: "vibe://wallet",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "house-3",
    advertiser_name: "Vibe",
    title: "Find Your Vibe Match 💜",
    description: "Connect with people who match your vibe",
    media_url: null,
    cta_text: "Find Vibe",
    cta_url: "vibe://findvibe",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "house-4",
    advertiser_name: "Vibe",
    title: "Go Live & Earn Coins 🔴",
    description: "Start streaming and receive gifts from fans",
    media_url: null,
    cta_text: "Go Live",
    cta_url: "vibe://live",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "house-5",
    advertiser_name: "Vibe",
    title: "Invite Friends & Earn 🎉",
    description: "Get 100 coins for every friend you invite",
    media_url: null,
    cta_text: "Invite Now",
    cta_url: "vibe://invite",
    isAd: true,
    isHouseAd: true,
  },
];

export const HOUSE_REEL_ADS: AdItem[] = [
  {
    ad_id: "reel-house-1",
    advertiser_name: "Vibe",
    title: "Create your first Reel 🎬",
    description: "Share your moments with the world. It only takes 30 seconds.",
    media_url: null,
    cta_text: "Create Now",
    cta_url: "vibe://create",
    ad_type: "reel",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "reel-house-2",
    advertiser_name: "Vibe",
    title: "Find your Vibe ✨",
    description: "Discover people who share your energy. Swipe, match, connect.",
    media_url: null,
    cta_text: "Explore",
    cta_url: "vibe://findvibe",
    ad_type: "reel",
    isAd: true,
    isHouseAd: true,
  },
  {
    ad_id: "reel-house-3",
    advertiser_name: "Vibe",
    title: "Advertise on Vibe 📣",
    description: "Reach millions of users. Launch your campaign today.",
    media_url: null,
    cta_text: "Get Started",
    cta_url: "vibe://advertise",
    ad_type: "reel",
    isAd: true,
    isHouseAd: true,
  },
];

const HOUSE_AD_GRADIENTS: Record<string, [string, string]> = {
  "house-1": ["#7C3AED", "#4F46E5"],
  "house-2": ["#F97316", "#EAB308"],
  "house-3": ["#7C3AED", "#EC4899"],
  "house-4": ["#EF4444", "#F97316"],
  "house-5": ["#059669", "#7C3AED"],
};

export function getHouseAdGradient(adId: string): [string, string] {
  return HOUSE_AD_GRADIENTS[adId] ?? ["#7C3AED", "#EC4899"];
}

export function insertAdsInFeed<T>(posts: T[], ads: AdItem[]): (T | AdItem)[] {
  if (ads.length === 0) return posts;
  const result: (T | AdItem)[] = [];
  posts.forEach((post, index) => {
    result.push(post);
    if ((index + 1) % 4 === 0) {
      result.push({ ...ads[Math.floor(index / 4) % ads.length] });
    }
  });
  return result;
}

export function insertAdsInReels<T>(reels: T[], ads: AdItem[]): (T | AdItem)[] {
  if (ads.length === 0) return reels;
  const result: (T | AdItem)[] = [];
  reels.forEach((reel, index) => {
    result.push(reel);
    if ((index + 1) % 3 === 0) {
      result.push({ ...ads[Math.floor(index / 3) % ads.length] });
    }
  });
  return result;
}

export async function loadFeedAds(
  userId: string | undefined,
  adType: "feed_post" | "reel" = "feed_post"
): Promise<AdItem[]> {
  const fallback = adType === "reel" ? HOUSE_REEL_ADS : HOUSE_ADS;
  if (!userId) return fallback;
  try {
    const { data } = await supabase.rpc("get_feed_ads", {
      p_user_id: userId,
      p_ad_type: adType,
      p_limit: 5,
    });
    if (data && Array.isArray(data) && data.length > 0) {
      return (data as AdItem[]).map((d) => ({ ...d, isAd: true as const }));
    }
  } catch {}
  return fallback;
}

export async function trackAdImpression(
  adId: string,
  userId: string | undefined
) {
  if (!userId || adId.startsWith("house-")) return;
  try {
    await supabase.rpc("track_ad_impression", {
      p_ad_id: adId,
      p_user_id: userId,
      p_impression_type: "view",
      p_watch_duration: 0,
    });
  } catch {}
}

export async function trackAdClick(
  adId: string,
  userId: string | undefined
) {
  if (!userId || adId.startsWith("house-")) return;
  try {
    await supabase.rpc("track_ad_click", {
      p_ad_id: adId,
      p_user_id: userId,
    });
  } catch {}
}

export function handleAdCta(ctaUrl: string) {
  if (ctaUrl.startsWith("vibe://")) {
    const path = ctaUrl.replace("vibe://", "");
    const routeMap: Record<string, string> = {
      verification: "/settings",
      wallet: "/wallet",
      findvibe: "/(tabs)/find",
      live: "/live",
      invite: "/find-friends",
      advertise: "/advertise",
      create: "/(tabs)/create",
    };
    const route = routeMap[path];
    if (route) router.push(route as any);
  } else {
    Linking.openURL(ctaUrl).catch(() => {});
  }
}

export async function hideAd(adId: string, userId: string | undefined) {
  if (!userId || adId.startsWith("house-")) return;
  try {
    await supabase
      .from("hidden_ads")
      .upsert({ user_id: userId, ad_id: adId });
  } catch {}
}
