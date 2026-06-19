import { Share } from "react-native";

export const BASE_URL = "https://gundrukapp.com";

export type VibeContentType = "profile" | "post" | "reel" | "story" | "highlight" | "hashtag" | "sound" | "location" | "live";

export function buildVibeUrl(type: VibeContentType, params: Record<string, string>): string {
  switch (type) {
    case "profile":   return `${BASE_URL}/@${params.username}`;
    case "post":      return `${BASE_URL}/@${params.username}/post/${params.id}`;
    case "reel":      return `${BASE_URL}/@${params.username}/reel/${params.id}`;
    case "story":     return `${BASE_URL}/@${params.username}/story/${params.id}`;
    case "highlight": return `${BASE_URL}/@${params.username}/highlight/${params.id}`;
    case "hashtag":   return `${BASE_URL}/hashtag/${params.tag}`;
    case "sound":     return `${BASE_URL}/sound/${params.id}`;
    case "location":  return `${BASE_URL}/location/${encodeURIComponent(params.name ?? params.id)}`;
    case "live":      return `${BASE_URL}/@${params.username}/live`;
    default:          return BASE_URL;
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
