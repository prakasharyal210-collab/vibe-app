import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./AuthContext";

export type ToastType = "like" | "comment" | "follow" | "vibe" | "mention" | "message";

export interface Toast {
  id: string;
  type: ToastType;
  username: string;
  message: string;
  avatar_url?: string;
  post_image?: string;
  navigateTo?: string;
  at: number;
}

interface RealtimeContextType {
  notifCount: number;
  messageCount: number;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  clearNotifBadge: () => void;
  clearMessageBadge: () => void;
}

const RealtimeContext = createContext<RealtimeContextType>({
  notifCount: 0,
  messageCount: 0,
  toasts: [],
  dismissToast: () => {},
  clearNotifBadge: () => {},
  clearMessageBadge: () => {},
});

let toastIdCounter = 0;
function nextToastId() { return `toast_${++toastIdCounter}_${Date.now()}`; }

const TOAST_DURATION = 3500;

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [notifCount, setNotifCount] = useState(0);
  const [messageCount, setMessageCount] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const addToast = useCallback((toast: Omit<Toast, "id" | "at">) => {
    const id = nextToastId();
    const entry: Toast = { ...toast, id, at: Date.now() };
    setToasts((prev) => [entry, ...prev].slice(0, 5));
    // auto-dismiss
    timerRefs.current[id] = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      delete timerRefs.current[id];
    }, TOAST_DURATION);
  }, []);

  const dismissToast = useCallback((id: string) => {
    clearTimeout(timerRefs.current[id]);
    delete timerRefs.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const clearNotifBadge = useCallback(() => setNotifCount(0), []);
  const clearMessageBadge = useCallback(() => setMessageCount(0), []);

  // Tear down all channels
  const clearChannels = useCallback(() => {
    channelsRef.current.forEach((ch) => {
      supabase.removeChannel(ch);
    });
    channelsRef.current = [];
  }, []);

  useEffect(() => {
    if (!userId) {
      clearChannels();
      setNotifCount(0);
      setMessageCount(0);
      setToasts([]);
      return;
    }

    clearChannels();

    // ── Notifications channel ──────────────────────────────────────
    const notifChannel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload: any) => {
          try {
            const n = payload.new;
            if (!n) return;
            setNotifCount((c) => c + 1);
            const typeMap: Record<string, ToastType> = {
              like: "like", comment: "comment", follow: "follow",
              vibe: "vibe", mention: "mention",
            };
            const msgMap: Record<string, string> = {
              like: "liked your post", comment: "commented on your post",
              follow: "started following you", vibe: "matched your vibe ✨",
              mention: "mentioned you in a comment",
            };
            addToast({
              type: typeMap[n.type] ?? "like",
              username: n.actor_username ?? n.username ?? "someone",
              message: n.text ?? msgMap[n.type] ?? "interacted with your post",
              avatar_url: n.actor_avatar_url,
              post_image: n.post_image,
              navigateTo: n.type === "follow" ? `/profile/${n.actor_username}` : undefined,
            });
          } catch { /* never crash on a realtime event */ }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Silently ignore — app works without realtime
        }
      });

    // ── Messages channel ───────────────────────────────────────────
    const msgChannel = supabase
      .channel(`messages:${userId}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_id=eq.${userId}`,
        },
        (payload: any) => {
          try {
            const m = payload.new;
            if (!m) return;
            setMessageCount((c) => c + 1);
            addToast({
              type: "message",
              username: m.sender_username ?? "Someone",
              message: m.text?.slice(0, 60) ?? "sent you a message",
              avatar_url: m.sender_avatar_url,
              navigateTo: m.sender_id ? `/chat/${m.sender_id}` : "/inbox",
            });
          } catch { /* never crash on a realtime event */ }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          // Silently ignore — app works without realtime
        }
      });

    channelsRef.current = [notifChannel, msgChannel];

    return () => {
      clearChannels();
    };
  }, [userId, addToast, clearChannels]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(timerRefs.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ notifCount, messageCount, toasts, dismissToast, clearNotifBadge, clearMessageBadge }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);

// ── Per-post hook ──────────────────────────────────────────────────────────────
interface PostCounts {
  likes_count: number;
  comments_count: number;
  reposts_count?: number;
  views_count?: number;
}

export function usePostRealtime(postId: string | undefined, initial: PostCounts) {
  const [counts, setCounts] = useState<PostCounts>(initial);
  const prevCounts = useRef<PostCounts>(initial);
  const [bumped, setBumped] = useState<keyof PostCounts | null>(null);
  // Unique suffix per mount so rapid unmount/remount never collides with a
  // still-tearing-down channel of the same name ("can't add callbacks after subscribe").
  const channelSuffix = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!postId) return;
    const channelName = `post:${postId}:${channelSuffix.current}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "posts", filter: `id=eq.${postId}` },
          (payload: any) => {
            try {
              const n = payload.new as PostCounts;
              const prev = prevCounts.current;
              const bumpKey =
                (n.likes_count ?? 0) > (prev.likes_count ?? 0) ? "likes_count" :
                (n.comments_count ?? 0) > (prev.comments_count ?? 0) ? "comments_count" :
                (n.reposts_count ?? 0) > (prev.reposts_count ?? 0) ? "reposts_count" :
                null;
              setCounts({
                likes_count: Math.max(0, n.likes_count ?? prev.likes_count),
                comments_count: Math.max(0, n.comments_count ?? prev.comments_count),
                reposts_count: Math.max(0, n.reposts_count ?? prev.reposts_count ?? 0),
                views_count: Math.max(0, n.views_count ?? prev.views_count ?? 0),
              });
              prevCounts.current = n;
              if (bumpKey) {
                setBumped(bumpKey);
                setTimeout(() => setBumped(null), 600);
              }
            } catch { /* never crash on realtime payload */ }
          }
        )
        .subscribe();
    } catch {
      // Supabase threw "can't add callbacks after subscribe()" — safe to ignore,
      // the feed works fine without live count updates.
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [postId]);

  return { counts, bumped };
}

// ── Per-profile hook ───────────────────────────────────────────────────────────
interface ProfileCounts {
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
}

export function useProfileRealtime(profileId: string | null, initial: ProfileCounts) {
  const [counts, setCounts] = useState<ProfileCounts>(initial);
  // Unique suffix per mount — same race-condition fix as usePostRealtime
  const channelSuffix = useRef(`${Date.now()}_${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    if (!profileId) return;
    const channelName = `profile:${profileId}:${channelSuffix.current}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(channelName)
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${profileId}` },
          (payload: any) => {
            try {
              const n = payload.new;
              setCounts({
                followers_count: Math.max(0, n.followers_count ?? 0),
                following_count: Math.max(0, n.following_count ?? 0),
                posts_count: Math.max(0, n.posts_count ?? 0),
              });
            } catch { /* never crash on realtime payload */ }
          }
        )
        .subscribe();
    } catch {
      // Supabase threw "can't add callbacks after subscribe()" — safe to ignore
    }
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [profileId]);

  // sync when initial changes (e.g. profile loaded from DB)
  useEffect(() => {
    setCounts(initial);
  }, [initial.followers_count, initial.following_count, initial.posts_count]);

  return counts;
}
