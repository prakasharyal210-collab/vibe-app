import { Share } from "react-native";

export type VibeContentType = "profile" | "post" | "reel" | "story" | "highlight" | "hashtag" | "sound" | "location" | "live";

export function buildVibeUrl(type: VibeContentType, params: Record<string, string>): string {
  switch (type) {
    case "profile":   return `https://vibe.app/@${params.username}`;
    case "post":      return `https://vibe.app/@${params.username}/post/${params.id}`;
    case "reel":      return `https://vibe.app/@${params.username}/reel/${params.id}`;
    case "story":     return `https://vibe.app/@${params.username}/story/${params.id}`;
    case "highlight": return `https://vibe.app/@${params.username}/highlight/${params.id}`;
    case "hashtag":   return `https://vibe.app/hashtag/${params.tag}`;
    case "sound":     return `https://vibe.app/sound/${params.id}`;
    case "location":  return `https://vibe.app/location/${encodeURIComponent(params.name ?? params.id)}`;
    case "live":      return `https://vibe.app/@${params.username}/live`;
    default:          return "https://vibe.app";
  }
}

export async function shareContent(
  type: VibeContentType,
  params: Record<string, string>,
  title?: string,
): Promise<void> {
  const url = buildVibeUrl(type, params);
  const message = title ? `${title}\n\n${url}` : url;
  try {
    await Share.share({ message, url });
  } catch {
  }
}
