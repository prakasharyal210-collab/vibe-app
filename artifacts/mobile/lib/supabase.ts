import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

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
}

export interface Post {
  id: string;
  user_id: string;
  image_url: string;
  caption?: string;
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

export const MOCK_POSTS: Post[] = [
  {
    id: "1",
    user_id: "u1",
    image_url: "https://picsum.photos/seed/vibe1/400/400",
    caption: "Golden hour hits different",
    likes_count: 342,
    comments_count: 28,
    created_at: new Date(Date.now() - 7200000).toISOString(),
    profiles: { id: "u1", username: "luna_sky" },
  },
  {
    id: "2",
    user_id: "u2",
    image_url: "https://picsum.photos/seed/vibe2/400/400",
    caption: "City vibes never get old",
    likes_count: 891,
    comments_count: 64,
    created_at: new Date(Date.now() - 14400000).toISOString(),
    profiles: { id: "u2", username: "marcus_vibe" },
  },
  {
    id: "3",
    user_id: "u3",
    image_url: "https://picsum.photos/seed/vibe3/400/400",
    caption: "Living in the moment",
    likes_count: 1204,
    comments_count: 97,
    created_at: new Date(Date.now() - 86400000).toISOString(),
    profiles: { id: "u3", username: "zoe.creates" },
  },
  {
    id: "4",
    user_id: "u4",
    image_url: "https://picsum.photos/seed/vibe4/400/400",
    caption: "This view though",
    likes_count: 567,
    comments_count: 41,
    created_at: new Date(Date.now() - 172800000).toISOString(),
    profiles: { id: "u4", username: "kai_adventures" },
  },
  {
    id: "5",
    user_id: "u5",
    image_url: "https://picsum.photos/seed/vibe5/400/400",
    caption: "Weekend energy",
    likes_count: 2341,
    comments_count: 183,
    created_at: new Date(Date.now() - 259200000).toISOString(),
    profiles: { id: "u5", username: "nadia.official" },
  },
];

export const MOCK_STORIES = [
  { id: "s0", username: "Your Story", isOwn: true },
  { id: "s1", username: "luna_sky" },
  { id: "s2", username: "marcus_vibe" },
  { id: "s3", username: "zoe.creates" },
  { id: "s4", username: "kai_adventures" },
  { id: "s5", username: "nadia.official" },
  { id: "s6", username: "alex.w" },
];

export const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "c1",
    other_user: { id: "u1", username: "luna_sky" },
    last_message: "omg that photo was stunning!",
    last_message_at: new Date(Date.now() - 1800000).toISOString(),
    unread_count: 2,
  },
  {
    id: "c2",
    other_user: { id: "u2", username: "marcus_vibe" },
    last_message: "Let's collab on something this weekend",
    last_message_at: new Date(Date.now() - 7200000).toISOString(),
    unread_count: 0,
  },
  {
    id: "c3",
    other_user: { id: "u3", username: "zoe.creates" },
    last_message: "Sent you a reel",
    last_message_at: new Date(Date.now() - 86400000).toISOString(),
    unread_count: 1,
  },
  {
    id: "c4",
    other_user: { id: "u4", username: "kai_adventures" },
    last_message: "Where was that taken?",
    last_message_at: new Date(Date.now() - 172800000).toISOString(),
    unread_count: 0,
  },
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
