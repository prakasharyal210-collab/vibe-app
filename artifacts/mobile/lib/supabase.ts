import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://tatroqgcyebuqqkhmvpa.supabase.co";

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "sb_publishable_PqzFyJK0m-HoZuBvKib4pw_VOgrSuzF";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export interface Profile {
  id: string;
  username: string;
  avatar_url?: string;
  bio?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
  location?: string;
  is_verified?: boolean;
  is_private?: boolean;
}

export interface Post {
  id: string;
  user_id: string;
  image_url: string;
  images?: string[];
  caption?: string;
  location?: string;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles?: Profile;
  music_title?: string;
  music_artist?: string;
}

export interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url?: string;
  caption?: string;
  hashtags?: string[];
  music_id?: string;
  duration?: number;
  is_public?: boolean;
  likes_count: number;
  comments_count: number;
  created_at: string;
  profiles?: Profile;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  text: string;
  created_at: string;
  likes_count?: number;
  profiles?: Profile;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  text: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  other_user: Profile;
  last_message: string;
  last_message_at: string;
  unread_count: number;
}

export interface Notification {
  id: string;
  type: "like" | "comment" | "follow" | "vibe" | "mention";
  username: string;
  text: string;
  time: string;
  read: boolean;
  post_image?: string;
}

export interface Hashtag {
  tag: string;
  count: string;
  image: string;
}

export const MOCK_POSTS: Post[] = [
  {
    id: "1",
    user_id: "u1",
    image_url: "https://picsum.photos/seed/vibe1/400/400",
    images: [
      "https://picsum.photos/seed/vibe1/400/400",
      "https://picsum.photos/seed/vibe1b/400/400",
      "https://picsum.photos/seed/vibe1c/400/400",
    ],
    caption: "Golden hour hits different ✨ #sunset #vibes",
    location: "Santorini, Greece",
    likes_count: 342,
    comments_count: 28,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    profiles: { id: "u1", username: "luna_sky", is_verified: true },
  },
  {
    id: "2",
    user_id: "u2",
    image_url: "https://picsum.photos/seed/vibe2/400/400",
    images: ["https://picsum.photos/seed/vibe2/400/400"],
    caption: "City vibes never get old 🌃 #citylife #nightout",
    location: "New York, NY",
    likes_count: 891,
    comments_count: 64,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    profiles: { id: "u2", username: "marcus_vibe" },
  },
  {
    id: "3",
    user_id: "u3",
    image_url: "https://picsum.photos/seed/vibe3/400/400",
    images: [
      "https://picsum.photos/seed/vibe3/400/400",
      "https://picsum.photos/seed/vibe3b/400/400",
    ],
    caption: "Living in the moment 🎨 #art #creative",
    likes_count: 1204,
    comments_count: 97,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    profiles: { id: "u3", username: "zoe.creates", is_verified: true },
  },
  {
    id: "4",
    user_id: "u4",
    image_url: "https://picsum.photos/seed/vibe4/400/400",
    images: [
      "https://picsum.photos/seed/vibe4/400/400",
      "https://picsum.photos/seed/vibe4b/400/400",
      "https://picsum.photos/seed/vibe4c/400/400",
      "https://picsum.photos/seed/vibe4d/400/400",
    ],
    caption: "This view though 🏔️ #adventure #nature",
    location: "Patagonia, Argentina",
    likes_count: 567,
    comments_count: 41,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    profiles: { id: "u4", username: "kai_adventures" },
  },
  {
    id: "5",
    user_id: "u5",
    image_url: "https://picsum.photos/seed/vibe5/400/400",
    images: ["https://picsum.photos/seed/vibe5/400/400"],
    caption: "Weekend energy is unmatched 🎉 #weekend #mood",
    likes_count: 2341,
    comments_count: 183,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    profiles: { id: "u5", username: "nadia.official", is_verified: true },
  },
];

export const MOCK_STORIES = [
  { id: "s0", username: "Your Story", isOwn: true, image: "https://picsum.photos/seed/own/200/200" },
  { id: "s1", username: "luna_sky", image: "https://picsum.photos/seed/s1/200/200", hasNew: true },
  { id: "s2", username: "marcus_vibe", image: "https://picsum.photos/seed/s2/200/200", hasNew: true },
  { id: "s3", username: "zoe.creates", image: "https://picsum.photos/seed/s3/200/200", hasNew: false },
  { id: "s4", username: "kai_adventures", image: "https://picsum.photos/seed/s4/200/200", hasNew: true },
  { id: "s5", username: "nadia.official", image: "https://picsum.photos/seed/s5/200/200", hasNew: false },
  { id: "s6", username: "alex.w", image: "https://picsum.photos/seed/s6/200/200", hasNew: true },
];

export const MOCK_HIGHLIGHTS = [
  { id: "h1", label: "Travel", image: "https://picsum.photos/seed/hl1/200/200" },
  { id: "h2", label: "Art", image: "https://picsum.photos/seed/hl2/200/200" },
  { id: "h3", label: "Music", image: "https://picsum.photos/seed/hl3/200/200" },
  { id: "h4", label: "Food", image: "https://picsum.photos/seed/hl4/200/200" },
  { id: "h5", label: "Sunsets", image: "https://picsum.photos/seed/hl5/200/200" },
];

export const MOCK_COMMENTS: Comment[] = [
  { id: "cm1", post_id: "1", user_id: "u2", text: "This is absolutely stunning! 😍", created_at: new Date(Date.now() - 3600000).toISOString(), likes_count: 12, profiles: { id: "u2", username: "marcus_vibe" } },
  { id: "cm2", post_id: "1", user_id: "u3", text: "Where is this?? I need to go 🌅", created_at: new Date(Date.now() - 7200000).toISOString(), likes_count: 8, profiles: { id: "u3", username: "zoe.creates" } },
  { id: "cm3", post_id: "1", user_id: "u4", text: "The colors are unreal 🔥🔥🔥", created_at: new Date(Date.now() - 10800000).toISOString(), likes_count: 24, profiles: { id: "u4", username: "kai_adventures" } },
  { id: "cm4", post_id: "1", user_id: "u5", text: "Golden hour photographer spotted 📸", created_at: new Date(Date.now() - 14400000).toISOString(), likes_count: 5, profiles: { id: "u5", username: "nadia.official" } },
  { id: "cm5", post_id: "1", user_id: "u6", text: "Sharing this! 💜", created_at: new Date(Date.now() - 18000000).toISOString(), likes_count: 3, profiles: { id: "u6", username: "alex.w" } },
  { id: "cm6", post_id: "1", user_id: "u7", text: "My new wallpaper 🙏", created_at: new Date(Date.now() - 21600000).toISOString(), likes_count: 7, profiles: { id: "u7", username: "maya_art" } },
];

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: "n1", type: "like", username: "luna_sky", text: "liked your photo", time: "2m", read: false, post_image: "https://picsum.photos/seed/notif1/100/100" },
  { id: "n2", type: "comment", username: "marcus_vibe", text: 'commented: "Stunning vibes! 🔥"', time: "15m", read: false, post_image: "https://picsum.photos/seed/notif2/100/100" },
  { id: "n3", type: "follow", username: "zoe.creates", text: "started following you", time: "1h", read: false },
  { id: "n4", type: "vibe", username: "ariana_k", text: "sent you a vibe request ✨", time: "2h", read: true },
  { id: "n5", type: "like", username: "kai_adventures", text: "and 12 others liked your reel", time: "3h", read: true, post_image: "https://picsum.photos/seed/notif5/100/100" },
  { id: "n6", type: "mention", username: "nadia.official", text: "mentioned you in a comment", time: "5h", read: true, post_image: "https://picsum.photos/seed/notif6/100/100" },
  { id: "n7", type: "follow", username: "alex.w", text: "started following you", time: "1d", read: true },
  { id: "n8", type: "vibe", username: "marcus_vibe", text: "matched your vibe 💜", time: "1d", read: true },
  { id: "n9", type: "like", username: "maya_art", text: "liked your story", time: "2d", read: true },
  { id: "n10", type: "comment", username: "jay_create", text: 'commented: "This is everything 💯"', time: "2d", read: true, post_image: "https://picsum.photos/seed/notif10/100/100" },
];

export const MOCK_HASHTAGS: Hashtag[] = [
  { tag: "sunset", count: "2.4M posts", image: "https://picsum.photos/seed/ht1/300/200" },
  { tag: "vibes", count: "18.1M posts", image: "https://picsum.photos/seed/ht2/300/200" },
  { tag: "photography", count: "5.7M posts", image: "https://picsum.photos/seed/ht3/300/200" },
  { tag: "citylife", count: "9.3M posts", image: "https://picsum.photos/seed/ht4/300/200" },
  { tag: "aesthetic", count: "34.2M posts", image: "https://picsum.photos/seed/ht5/300/200" },
  { tag: "travel", count: "67.8M posts", image: "https://picsum.photos/seed/ht6/300/200" },
  { tag: "art", count: "22.1M posts", image: "https://picsum.photos/seed/ht7/300/200" },
  { tag: "music", count: "41.5M posts", image: "https://picsum.photos/seed/ht8/300/200" },
];

export const MOCK_SEARCH_ACCOUNTS: Profile[] = [
  { id: "sa1", username: "luna_sky", bio: "Photographer & traveler ✨", followers_count: 124000, is_verified: true },
  { id: "sa2", username: "marcus_vibe", bio: "Music producer 🎵 Dog dad", followers_count: 89000 },
  { id: "sa3", username: "zoe.creates", bio: "Artist & content creator 🎨", followers_count: 204000, is_verified: true },
  { id: "sa4", username: "kai_adventures", bio: "Adventure is my middle name 🏔️", followers_count: 56000 },
  { id: "sa5", username: "nadia.official", bio: "Actress & creator 🎬", followers_count: 432000, is_verified: true },
  { id: "sa6", username: "alex.w", bio: "Music & art 🎵", followers_count: 67800 },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  { id: "c1", other_user: { id: "u1", username: "luna_sky" }, last_message: "omg that photo was stunning!", last_message_at: new Date(Date.now() - 1800000).toISOString(), unread_count: 2 },
  { id: "c2", other_user: { id: "u2", username: "marcus_vibe" }, last_message: "Let's collab on something this weekend", last_message_at: new Date(Date.now() - 7200000).toISOString(), unread_count: 0 },
  { id: "c3", other_user: { id: "u3", username: "zoe.creates" }, last_message: "Sent you a reel", last_message_at: new Date(Date.now() - 86400000).toISOString(), unread_count: 1 },
  { id: "c4", other_user: { id: "u4", username: "kai_adventures" }, last_message: "Where was that taken?", last_message_at: new Date(Date.now() - 172800000).toISOString(), unread_count: 0 },
];

export const MOCK_NEARBY_USERS: Profile[] = [
  { id: "n1", username: "jayden.local", bio: "Photographer & traveler", location: "0.3 km away" },
  { id: "n2", username: "mia_nearby", bio: "Coffee addict & creator", location: "0.8 km away" },
  { id: "n3", username: "ryan.close", bio: "Music producer", location: "1.2 km away" },
  { id: "n4", username: "sofia_near", bio: "Fitness & lifestyle", location: "2.1 km away" },
];

export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
