import { Share } from "react-native";

export type VibeContentType = "profile" | "post" | "reel" | "story" | "highlight" | "hashtag" | "sound" | "location" | "live";

export function buildVibeUrl(type: VibeContentType, params: Record<string, string>): string {
  switch (type) {
    case "profile":   return `https://gundrukapp.com/@${params.username}`;
    case "post":      return `https://gundrukapp.com/@${params.username}/post/${params.id}`;
    case "reel":      return `https://gundrukapp.com/@${params.username}/reel/${params.id}`;
    case "story":     return `https://gundrukapp.com/@${params.username}/story/${params.id}`;
    case "highlight": return `https://gundrukapp.com/@${params.username}/highlight/${params.id}`;
    case "hashtag":   return `https://gundrukapp.com/hashtag/${params.tag}`;
    case "sound":     return `https://gundrukapp.com/sound/${params.id}`;
    case "location":  return `https://gundrukapp.com/location/${encodeURIComponent(params.name ?? params.id)}`;
    case "live":      return `https://gundrukapp.com/@${params.username}/live`;
    default:          return "https://gundrukapp.com";
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
