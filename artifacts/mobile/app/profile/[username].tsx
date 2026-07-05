import { BASE_URL } from "@/lib/share";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import RAnimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullScreenMediaViewer, MediaItem } from "@/components/FullScreenMediaViewer";
import { RelationshipStatusBadge } from "@/components/RelationshipStatusBadge";
import { ZodiacSignBadge } from "@/components/ZodiacSignBadge";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import {
  amIBlockedBy,
  blockUser,
  checkIsFollowing,
  fetchProfilePosts,
  fetchUserPolls,
  getOrCreateConversation,
  isUserBlocked,
  lookupProfileByUsername,
  PollPostItem,
  ProfileGridItem,
  PublicProfile,
  reportContent,
  restrictUser,
} from "@/lib/db";
import PollCard, { PollData } from "@/components/PollCard";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
const BLOCKED_RS = ["Married", "Engaged", "Widowed"];

// ─── Session-level profile cache ─────────────────────────────────────────────
// Keyed by `${username}:${viewerId}`. TTL 60 s. Cleared on explicit navigation
// so repeat taps return instantly without a round-trip.
const PROFILE_CACHE_TTL = 60_000;
type CacheEntry = { profile: PublicProfile; ts: number };
const _profileCache = new Map<string, CacheEntry>();
function _cacheGet(key: string): PublicProfile | null {
  const e = _profileCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > PROFILE_CACHE_TTL) { _profileCache.delete(key); return null; }
  return e.profile;
}
function _cacheSet(key: string, profile: PublicProfile) {
  _profileCache.set(key, { profile, ts: Date.now() });
}

async function muteUser(muterId: string, mutedId: string): Promise<void> {
  await fetch(`${API_BASE}/users/social/mute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muterId, mutedId }),
  });
}
async function unmuteUser(muterId: string, mutedId: string): Promise<void> {
  await fetch(`${API_BASE}/users/social/mute`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muterId, mutedId }),
  });
}
async function getMuteStatus(muterId: string, mutedId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/users/social/mute-status?muterId=${muterId}&mutedId=${mutedId}`);
    const json = res.ok ? await res.json() : {};
    return !!json.muted;
  } catch { return false; }
}
async function getMutualFollowers(viewerId: string, targetId: string): Promise<{ usernames: string[]; count: number }> {
  try {
    const res = await fetch(`${API_BASE}/users/social/mutuals?viewerId=${viewerId}&targetId=${targetId}`);
    const json = res.ok ? await res.json() : { mutuals: [], count: 0 };
    return { usernames: (json.mutuals ?? []).map((m: any) => m.username), count: json.count ?? 0 };
  } catch { return { usernames: [], count: 0 }; }
}
async function getVibeCompatibility(userId: string, targetId: string): Promise<number | null> {
  try {
    const res = await fetch(`${API_BASE}/vibe/compatibility?userId=${userId}&targetId=${targetId}`);
    const json = res.ok ? await res.json() : {};
    return typeof json.score === "number" ? json.score : null;
  } catch { return null; }
}

const { width: W } = Dimensions.get("window");
const GRID_SIZE = (W - 3) / 3;
const AVATAR_SIZE = 88;
const RING_SIZE = AVATAR_SIZE + 12;
const VIBE_RING_SIZE = RING_SIZE + 28;

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const REPORT_REASONS = [
  "Spam or fake account",
  "Harassment or bullying",
  "Inappropriate content",
  "Hate speech",
  "Violence or dangerous content",
  "Impersonation",
  "Other",
];

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TAB_DEFS = [
  { id: "posts" as const, icon: "grid-outline" as const, label: "Posts" },
  { id: "reels" as const, icon: "play-circle-outline" as const, label: "Reels" },
  { id: "polls" as const, icon: "bar-chart-outline" as const, label: "Polls" },
];

// ─── VibeRing (SVG arc) ───────────────────────────────────────────────────────

function VibeRing({ score, size }: { score: number | null; size: number }) {
  const STROKE = 4;
  const R = (size - STROKE * 2) / 2 - 2;
  const CIRC = 2 * Math.PI * R;
  const validScore = score ?? 0;
  const dashOffset = CIRC * (1 - validScore / 100);

  return (
    <View style={{ width: size, height: size, position: "absolute", top: 0, left: 0 }} pointerEvents="none">
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          stroke={score !== null ? "#F97316" : "transparent"}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={vsStyles.label}>
        <Text style={vsStyles.pct}>{score !== null ? `${score}%` : "—"}</Text>
        <Text style={vsStyles.word}>Vibe</Text>
      </View>
    </View>
  );
}

const vsStyles = StyleSheet.create({
  label: { position: "absolute", bottom: -18, left: 0, right: 0, alignItems: "center" },
  pct: { color: "#F97316", fontFamily: "Poppins_700Bold", fontSize: 11 },
  word: { color: "rgba(255,255,255,0.45)", fontFamily: "Poppins_400Regular", fontSize: 9, marginTop: -3 },
});

// ─── RotatingAvatarRing ───────────────────────────────────────────────────────

function RotatingAvatarRing({ username, url }: { username: string; url?: string }) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 3200, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: "center", justifyContent: "center" }}>
      <RAnimated.View style={[StyleSheet.absoluteFill, spinStyle]}>
        <LinearGradient
          colors={["#F97316", "#7C3AED", "#EC4899", "#F97316"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2 }}
        />
      </RAnimated.View>
      <View style={{
        width: AVATAR_SIZE + 4,
        height: AVATAR_SIZE + 4,
        borderRadius: (AVATAR_SIZE + 4) / 2,
        backgroundColor: "#0A0A14",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <UserAvatar username={username} url={url} size={AVATAR_SIZE} />
      </View>
    </View>
  );
}

// ─── VibeStatusPill ───────────────────────────────────────────────────────────

function VibeStatusPill({ vibeStatus }: { vibeStatus: string }) {
  const bounce = useSharedValue(0);

  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 380, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 380, easing: Easing.in(Easing.quad) })
      ),
      -1,
      false
    );
  }, []);

  const bounceStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounce.value }],
  }));

  const spaceIdx = vibeStatus.indexOf(" ");
  const emoji = spaceIdx > 0 ? vibeStatus.slice(0, spaceIdx) : "✨";
  const label = spaceIdx > 0 ? vibeStatus.slice(spaceIdx + 1) : vibeStatus;

  return (
    <View style={vpStyles.statusPill}>
      <RAnimated.Text style={[{ fontSize: 14 }, bounceStyle]}>{emoji}</RAnimated.Text>
      <Text style={vpStyles.statusLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// ─── PinnedPostCard ───────────────────────────────────────────────────────────

function PinnedPostCard({
  post,
  onPress,
}: {
  post: { id: string; image: string; caption?: string | null; isVideo?: boolean };
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={ppStyles.card} activeOpacity={0.88} onPress={onPress}>
      <Image source={{ uri: post.image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.82)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={ppStyles.badge}>
        <Text style={{ fontSize: 11 }}>📌</Text>
        <Text style={ppStyles.badgeText}>Pinned</Text>
      </View>
      {post.isVideo && (
        <View style={ppStyles.videoBadge}>
          <Ionicons name="play" size={14} color="#fff" />
        </View>
      )}
      {post.caption ? (
        <Text style={ppStyles.caption} numberOfLines={2}>{post.caption}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const ppStyles = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 14, height: 200, borderRadius: 18, overflow: "hidden", position: "relative" },
  badge: { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  badgeText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  videoBadge: { position: "absolute", top: 12, right: 12, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, padding: 5 },
  caption: { position: "absolute", bottom: 14, left: 14, right: 14, color: "#fff", fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 19 },
});

// ─── ContentTabBar ────────────────────────────────────────────────────────────

function ContentTabBar({
  activeTab,
  onTabChange,
  tabScrollX,
}: {
  activeTab: string;
  onTabChange: (tab: "posts" | "reels" | "polls") => void;
  tabScrollX: Animated.Value;
}) {
  const tabWidth = W / TAB_DEFS.length;
  return (
    <View style={ctStyles.wrap}>
      <View style={ctStyles.row}>
        {TAB_DEFS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onTabChange(tab.id)}
              style={ctStyles.tab}
            >
              <Ionicons
                name={tab.icon as any}
                size={18}
                color={isActive ? "#F97316" : "rgba(255,255,255,0.38)"}
              />
              <Text style={[ctStyles.tabLabel, { color: isActive ? "#F97316" : "rgba(255,255,255,0.38)" }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {/* Indicator moves continuously with scroll, not just on tab settle */}
      <Animated.View
        style={[
          ctStyles.indicator,
          {
            width: tabWidth,
            transform: [{
              translateX: tabScrollX.interpolate({
                inputRange: [0, W, W * 2],
                outputRange: [0, tabWidth, tabWidth * 2],
                extrapolate: "clamp",
              }),
            }],
          },
        ]}
      />
    </View>
  );
}

const ctStyles = StyleSheet.create({
  wrap: { borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: "rgba(255,255,255,0.08)", position: "relative" },
  row: { flexDirection: "row" },
  tab: { flex: 1, alignItems: "center", paddingVertical: 10, gap: 3 },
  tabLabel: { fontFamily: "Poppins_500Medium", fontSize: 10 },
  indicator: { position: "absolute", bottom: 0, height: 2, backgroundColor: "#F97316" },
});

// ─── ProfileGridThumb ─────────────────────────────────────────────────────────

type GridThumbData = {
  id: string;
  image: string;
  likes?: number | null;
  isVideo?: boolean;
  isPinned?: boolean;
};

function ProfileGridThumb({ item, onPress }: { item: GridThumbData; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.gridItem} activeOpacity={0.88} onPress={onPress}>
      <Image source={{ uri: item.image }} style={styles.gridImage} resizeMode="cover" />
      {item.isVideo && (
        <View style={styles.videoOverlay} pointerEvents="none">
          <Ionicons name="play" size={18} color="#fff" />
        </View>
      )}
      {item.isPinned && (
        <View style={styles.pinOverlay} pointerEvents="none">
          <Text style={{ fontSize: 12 }}>📌</Text>
        </View>
      )}
      <View style={styles.gridLikeRow} pointerEvents="none">
        <Ionicons name="heart" size={12} color="#fff" />
        <Text style={styles.gridLikes}>
          {(item.likes ?? 0) >= 1000
            ? `${((item.likes ?? 0) / 1000).toFixed(1)}k`
            : item.likes ?? 0}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── ProfilePollRow ───────────────────────────────────────────────────────────
// Defined at module scope to avoid Ionicons glyph re-init on every parent render.

function ProfilePollRow({ item, userId }: { item: PollPostItem; userId: string | null }) {
  const colors = useColors();
  if (!item.poll) return null;
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.07)" }}>
      {!!item.caption && (
        <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: colors.foreground, lineHeight: 20, marginBottom: 10 }}>
          {item.caption}
        </Text>
      )}
      <PollCard poll={item.poll as PollData} userId={userId} />
      <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="heart-outline" size={13} color="rgba(255,255,255,0.4)" />
          <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {item.likes >= 1000 ? `${(item.likes / 1000).toFixed(1)}k` : item.likes}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Ionicons name="chatbubble-outline" size={13} color="rgba(255,255,255,0.4)" />
          <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
            {item.comments >= 1000 ? `${(item.comments / 1000).toFixed(1)}k` : item.comments}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── ThreeDotsModal ───────────────────────────────────────────────────────────

function ThreeDotsModal({ visible, onClose, username, userId, myId, onBlocked, onRestricted }: {
  visible: boolean;
  onClose: () => void;
  username: string;
  userId?: string;
  myId?: string;
  onBlocked?: () => void;
  onRestricted?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showReport, setShowReport] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (myId && userId) getMuteStatus(myId, userId).then(setIsMuted).catch(() => {});
  }, [myId, userId]);

  const handleMute = async () => {
    if (!myId || !userId) return;
    setBusy(true);
    const nowMuted = !isMuted;
    setIsMuted(nowMuted);
    try {
      if (nowMuted) await muteUser(myId, userId);
      else await unmuteUser(myId, userId);
      onClose();
      Alert.alert(nowMuted ? `Muted @${username}` : `Unmuted @${username}`, nowMuted ? "Their posts won't appear in your feed." : "Their posts will appear again.");
    } catch {
      setIsMuted(!nowMuted);
      Alert.alert("Error", "Could not update mute status.");
    } finally { setBusy(false); }
  };

  const handleBlock = () => {
    if (!myId) { Alert.alert("Sign in to block users"); return; }
    Alert.alert(`Block @${username}?`, `They won't be able to see your posts or find you on Gundruk.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Block", style: "destructive", onPress: async () => {
        setBusy(true);
        try { await blockUser(myId, userId ?? username); onClose(); onBlocked?.(); }
        catch { Alert.alert("Error", "Could not block user."); }
        finally { setBusy(false); }
      }},
    ]);
  };

  const handleRestrict = () => {
    if (!myId) { Alert.alert("Sign in to restrict users"); return; }
    Alert.alert(`Restrict @${username}?`, `Their comments will be hidden from others.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Restrict", onPress: async () => {
        setBusy(true);
        try { await restrictUser(myId, userId ?? username); onClose(); onRestricted?.(); Alert.alert("Restricted", `@${username} has been restricted.`); }
        catch { Alert.alert("Error", "Could not restrict user."); }
        finally { setBusy(false); }
      }},
    ]);
  };

  const handleReport = async (reason: string) => {
    if (!myId) { Alert.alert("Sign in to report users"); return; }
    setReporting(reason);
    try {
      await reportContent(myId, username, "user", reason);
      setShowReport(false);
      onClose();
      Alert.alert("Reported ✅", "Thank you. Our team will review this account within 24 hours.");
    } catch { Alert.alert("Error", "Could not submit report."); }
    finally { setReporting(null); }
  };

  const options: { icon: string; label: string; action: () => void; destructive?: boolean }[] = [
    { icon: "share-social", label: "Share Profile", action: () => Alert.alert("Share", `Share @${username}'s profile`) },
    { icon: "copy", label: "Copy Profile Link", action: () => Alert.alert("Copied!", `${BASE_URL}/@${username} copied`) },
    { icon: "volume-mute", label: isMuted ? `Unmute @${username}` : `Mute @${username}`, action: handleMute },
    { icon: "person-remove", label: busy ? "Please wait…" : `Block @${username}`, action: handleBlock, destructive: true },
    { icon: "eye-off", label: `Restrict @${username}`, action: handleRestrict, destructive: true },
    { icon: "flag", label: "Report User", action: () => setShowReport(true), destructive: true },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={menuStyles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[menuStyles.sheet, { backgroundColor: colors.card, paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 8 }]}>
        <View style={[menuStyles.handle, { backgroundColor: colors.border }]} />
        {!showReport ? (
          <>
            {options.map((opt, i) => (
              <TouchableOpacity key={i} onPress={opt.action} disabled={busy} style={[menuStyles.option, { borderBottomColor: colors.border }]}>
                <Ionicons name={opt.icon as any} size={20} color={opt.destructive ? "#EF4444" : colors.foreground} />
                <Text style={[menuStyles.optionText, { color: opt.destructive ? "#EF4444" : colors.foreground }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={[menuStyles.reportTitle, { color: colors.foreground }]}>Why are you reporting this account?</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity key={reason} onPress={() => handleReport(reason)} disabled={!!reporting} style={[menuStyles.option, { borderBottomColor: colors.border, opacity: reporting === reason ? 0.5 : 1 }]}>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                <Text style={[menuStyles.optionText, { color: colors.foreground }]}>{reporting === reason ? "Submitting…" : reason}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setShowReport(false)} style={[menuStyles.cancelBtn, { borderTopColor: colors.border }]}>
              <Text style={[menuStyles.cancelText, { color: colors.foreground }]}>Back</Text>
            </TouchableOpacity>
          </>
        )}
        {!showReport && (
          <TouchableOpacity onPress={onClose} style={[menuStyles.cancelBtn, { borderTopColor: colors.border }]}>
            <Text style={[menuStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

// ─── UserProfileScreen ────────────────────────────────────────────────────────

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [following, setFollowing] = useState(false);
  const [followSaving, setFollowSaving] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [isBlocked, setIsBlocked] = useState(false);
  const [amBlocked, setAmBlocked] = useState(false);
  const [vibeReqStatus, setVibeReqStatus] = useState<"none" | "pending" | "accepted" | "declined">("none");
  const [vibeReqId, setVibeReqId] = useState<string | null>(null);
  const [vibeReqLoading, setVibeReqLoading] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfileGridItem[]>([]);
  const [profilePolls, setProfilePolls] = useState<PollPostItem[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "polls">("posts");
  const [showMenu, setShowMenu] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; startIndex: number }>({ visible: false, startIndex: 0 });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [mutuals, setMutuals] = useState<{ usernames: string[]; count: number }>({ usernames: [], count: 0 });
  const [vibeScore, setVibeScore] = useState<number | null>(null);

  // Animations — pagerRef + tabScrollX drive the tab indicator continuously
  const pagerRef = useRef<ScrollView>(null);
  const tabScrollX = useRef(new Animated.Value(0)).current;

  const u = username ?? "";
  const topPad = Platform.OS === "web" ? 16 : insets.top;
  const floatingBarBottom = Platform.OS === "web" ? 84 : Math.max(insets.bottom, 0) + 10 + 68 + 8;

  // Reset stale profile data immediately when navigating to a different username.
  useEffect(() => {
    setProfile(null);
    setProfileLoaded(false);
  }, [u]);

  // ── Profile fetch — checks module-level cache first so repeat taps are instant ──
  useEffect(() => {
    if (!u) return;
    const cacheKey = `${u}:${myId ?? "guest"}`;
    const cached = _cacheGet(cacheKey);
    if (cached) {
      if (__DEV__) console.log(`[Profile] cache HIT for ${u} (skipping fetch)`);
      setProfile(cached);
      setFollowersCount(cached.followers_count ?? 0);
      setProfileLoaded(true);
      return;
    }
    const t0 = Date.now();
    if (__DEV__) console.log(`[Profile] fetch START for ${u} t=0ms`);
    lookupProfileByUsername(u, myId ?? undefined)
      .then((p) => {
        if (__DEV__) console.log(`[Profile] profile DONE t=${Date.now() - t0}ms found=${!!p}`);
        if (p) {
          setProfile(p);
          setFollowersCount(p.followers_count ?? 0);
          _cacheSet(cacheKey, p);
        }
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, [u, myId]);

  // ── Posts + polls — fire as soon as profile.id is available ──
  useEffect(() => {
    if (!profile?.id) return;
    const t0 = Date.now();
    if (__DEV__) console.log(`[Profile] posts+polls START t=0ms`);
    fetchProfilePosts(profile.id, myId)
      .then((p) => { if (__DEV__) console.log(`[Profile] posts DONE t=${Date.now() - t0}ms rows=${p.length}`); setPosts(p); })
      .catch(() => {});
    fetchUserPolls(profile.id, myId ?? undefined)
      .then((p) => { if (__DEV__) console.log(`[Profile] polls DONE t=${Date.now() - t0}ms rows=${p.length}`); setProfilePolls(p); })
      .catch(() => {});
  }, [profile?.id]);

  // ── Social state — 5 parallel calls, all independent ──
  useEffect(() => {
    if (!myId || !profile?.id) return;
    const t0 = Date.now();
    if (__DEV__) console.log(`[Profile] social state START (5 parallel) t=0ms`);
    checkIsFollowing(myId, profile.id)
      .then((v) => { if (__DEV__) console.log(`[Profile] isFollowing DONE t=${Date.now() - t0}ms val=${v}`); setFollowing(v); })
      .catch(() => {});
    isUserBlocked(myId, profile.id).then(setIsBlocked).catch(() => {});
    amIBlockedBy(myId, profile.id).then(setAmBlocked).catch(() => {});
    getMutualFollowers(myId, profile.id)
      .then((v) => { if (__DEV__) console.log(`[Profile] mutuals DONE t=${Date.now() - t0}ms count=${v.count}`); setMutuals(v); })
      .catch(() => {});
    // Vibe score is deferred — doesn't block header paint; ring shows "—" until it arrives
    getVibeCompatibility(myId, profile.id)
      .then((v) => { if (__DEV__) console.log(`[Profile] vibeScore DONE t=${Date.now() - t0}ms score=${v}`); setVibeScore(v); })
      .catch(() => {});
  }, [myId, profile?.id]);

  const handleTabChange = (tab: "posts" | "reels" | "polls") => {
    const idx = TAB_DEFS.findIndex((t) => t.id === tab);
    setActiveTab(tab);
    pagerRef.current?.scrollTo({ x: idx * W, animated: true });
  };

  const handleFollow = async () => {
    if (!myId || !profile?.id || followSaving) return;
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setFollowersCount((n) => (!wasFollowing ? n + 1 : Math.max(0, n - 1)));
    setFollowSaving(true);
    try {
      const method = wasFollowing ? "DELETE" : "POST";
      const res = await fetch(`${API_BASE}/users/social/follow`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followerId: myId, followingId: profile.id }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error ?? `HTTP ${res.status}`); }
    } catch (e: any) {
      setFollowing(wasFollowing);
      setFollowersCount((n) => (wasFollowing ? n + 1 : Math.max(0, n - 1)));
      Alert.alert(wasFollowing ? "Unfollow Failed" : "Follow Failed", e?.message ?? "Something went wrong.");
    } finally { setFollowSaving(false); }
  };

  const handleMessage = async () => {
    if (!myId || !profile?.id || openingChat) return;
    setOpeningChat(true);
    try {
      const res = await fetch(`${API_BASE}/users/social/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: myId, otherId: profile.id }),
      });
      const json = res.ok ? await res.json() : {};
      const targetId = json.conversationId ?? profile.id;
      router.push({ pathname: "/chat/[userId]", params: { userId: targetId, username: u, avatar_url: profile.avatar_url ?? "" } } as any);
    } catch {
      router.push({ pathname: "/chat/[userId]", params: { userId: profile.id, username: u } });
    } finally { setOpeningChat(false); }
  };

  const fullName = (profile as any)?.full_name || u.replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  // Vibe-request status — parallel with social state above; doesn't block any render
  useEffect(() => {
    if (!myId || !profile?.id || myId === profile.id) return;
    if (BLOCKED_RS.includes((profile as any).relationship_status ?? "")) return;
    const t0 = Date.now();
    fetch(`${API_BASE}/vibe-requests/status?senderId=${myId}&receiverId=${profile.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (__DEV__) console.log(`[Profile] vibeReqStatus DONE t=${Date.now() - t0}ms status=${data?.status ?? "none"}`);
        if (data?.status && data.status !== "none") {
          setVibeReqStatus(data.status as "pending" | "accepted" | "declined");
          if (data.requestId) setVibeReqId(data.requestId);
        }
      })
      .catch(() => {});
  }, [myId, profile?.id]);

  const handleVibeRequest = async () => {
    if (!myId || !profile?.id || vibeReqLoading) return;
    if (vibeReqStatus === "pending" || vibeReqStatus === "accepted") return;
    setVibeReqLoading(true);
    try {
      const res = await fetch(`${API_BASE}/vibe-requests/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: myId, receiverId: profile.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setVibeReqStatus("pending");
        if (data.requestId) setVibeReqId(data.requestId);
        Alert.alert("✨ Vibe Sent!", `Your vibe request was sent to ${fullName}.`);
      } else if (res.status === 409) {
        setVibeReqStatus(data.status ?? "pending");
        if (data.requestId) setVibeReqId(data.requestId);
      } else if (res.status === 403) {
        Alert.alert("Not available", "This user is not accepting vibe requests.");
      }
    } catch {
      Alert.alert("Error", "Could not send vibe request. Please try again.");
    } finally {
      setVibeReqLoading(false);
    }
  };

  const gridData = posts.map((p) => ({
    id: p.id,
    image: p.image_url || `https://picsum.photos/seed/${p.id}/400/400`,
    likes: p.likes,
    caption: p.caption,
    isVideo: p.isReel || p.is_video,
    isPinned: p.is_pinned,
    username: u,
  }));

  const gridPosts = gridData.filter(item => !item.isVideo);
  const gridReels = gridData.filter(item => !!item.isVideo);

  const ROW_H = GRID_SIZE + 1.5;
  const uPageH = (n: number) => Math.max(320, Math.ceil(n / 3) * ROW_H);
  const pollPageH = (n: number) => Math.max(320, n * 190);
  const pagerHeight = Math.max(uPageH(gridPosts.length), uPageH(gridReels.length), pollPageH(profilePolls.length), 320);

  const pinnedPost = gridData.find((p) => p.isPinned) ?? null;
  const pinnedIndex = pinnedPost ? gridData.findIndex((p) => p.isPinned) : -1;

  const blockedScreen = (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBarStatic, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.foreground }]}>Profile</Text>
        <View style={styles.iconBtn} />
      </View>
      <View style={notFoundSt.wrap}>
        <Text style={{ fontSize: 64 }}>🔍</Text>
        <Text style={[notFoundSt.title, { color: colors.foreground }]}>User not found</Text>
        <Text style={[notFoundSt.sub, { color: colors.mutedForeground }]}>This account doesn't exist or is unavailable.</Text>
        <TouchableOpacity onPress={() => router.back()} style={[notFoundSt.backBtn, { borderColor: colors.border }]}>
          <Text style={[notFoundSt.backBtnText, { color: colors.foreground }]}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (profileLoaded && !profile) return blockedScreen;
  if (profileLoaded && amBlocked) return blockedScreen;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Scrollable body */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, paddingTop: topPad + 50 }}
      >
        {/* Profile card */}
        <View style={[styles.profileCard, { backgroundColor: colors.background }]}>
          {isBlocked && (
            <View style={styles.blockedBanner}>
              <Ionicons name="ban" size={16} color="#fff" />
              <Text style={styles.blockedText}>You have blocked @{u}. They can't see your content.</Text>
            </View>
          )}

          {/* Avatar row: rotating ring + vibe ring + stats */}
          <View style={styles.avatarRow}>
            {/* 2 ── Rotating gradient ring + 3 ── Vibe score ring */}
            <View style={{ width: VIBE_RING_SIZE, height: VIBE_RING_SIZE + 22, alignItems: "center" }}>
              <View style={{ width: VIBE_RING_SIZE, height: VIBE_RING_SIZE, alignItems: "center", justifyContent: "center" }}>
                <VibeRing score={vibeScore} size={VIBE_RING_SIZE} />
                <RotatingAvatarRing username={u} url={profile?.avatar_url} />
              </View>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(profile?.posts_count ?? posts.length)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
              </View>
              <TouchableOpacity style={styles.statBox} onPress={() => router.push(`/followers/${u}?type=followers` as any)}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(followersCount)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statBox} onPress={() => router.push(`/followers/${u}?type=following` as any)}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(profile?.following_count ?? 0)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Bio section */}
          <View style={styles.bioSection}>
            <View style={styles.nameRow}>
              <Text style={[styles.fullName, { color: colors.foreground }]}>{fullName}</Text>
              {profile?.is_verified && <Ionicons name="checkmark-circle" size={17} color="#7C3AED" />}
            </View>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{u}</Text>

            {/* 4 ── Vibe status pill */}
            {profile?.vibe_status ? <VibeStatusPill vibeStatus={profile.vibe_status} /> : null}
            {profile?.relationship_status && !(profile as any)?.partner ? (
              <RelationshipStatusBadge status={profile.relationship_status} />
            ) : null}
            {profile?.zodiac_sign ? (
              <ZodiacSignBadge sign={profile.zodiac_sign} />
            ) : null}
            {profile?.pronouns ? (
              <View style={styles.pronounsBadge}>
                <Text style={styles.pronounsText}>{profile.pronouns}</Text>
              </View>
            ) : null}

            {profile?.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location" size={12} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{profile.location}</Text>
              </View>
            ) : null}
            {profile?.bio ? <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio}</Text> : null}
            {(profile as any)?.partner && (
              <TouchableOpacity
                onPress={() => router.push(`/profile/${(profile as any).partner.username}` as any)}
                style={styles.partnerBadge}
                activeOpacity={0.8}
              >
                <Text style={styles.partnerEmoji}>💑</Text>
                {(profile as any).partner.avatar_url ? (
                  <Image source={{ uri: (profile as any).partner.avatar_url }} style={styles.partnerAvatarSmall} />
                ) : (
                  <View style={[styles.partnerAvatarSmall, styles.partnerAvatarFallback]}>
                    <Text style={{ fontSize: 10 }}>👤</Text>
                  </View>
                )}
                <Text style={styles.partnerHandle}>@{(profile as any).partner.username}</Text>
              </TouchableOpacity>
            )}
            {mutuals.count > 0 && (
              <Text style={[styles.mutuals, { color: colors.mutedForeground }]}>
                {"Followed by "}
                <Text style={{ color: colors.foreground }}>{mutuals.usernames.slice(0, 2).join(", ")}</Text>
                {mutuals.count > 2 ? ` and ${mutuals.count - 2} others` : ""}
              </Text>
            )}
            {profile?.website ? (
              <TouchableOpacity onPress={() => Linking.openURL(`https://${profile.website}`)} style={styles.websiteRow}>
                <Ionicons name="link" size={13} color="#7C3AED" />
                <Text style={styles.websiteText}>{profile.website}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Privacy guards — private account or vibe-gated */}
        {profile?.is_vibe_gated ? (
          <View style={styles.privateWrap}>
            <Text style={{ fontSize: 44, marginBottom: 8 }}>💜</Text>
            <Text style={[styles.privateTitle, { color: colors.foreground }]}>Profile locked</Text>
            <Text style={[styles.privateSub, { color: colors.mutedForeground }]}>
              Full profiles are only visible to vibe request receivers and matches.
              {"\n"}Connect on Find Vibe to unlock.
            </Text>
          </View>
        ) : profile?.is_private ? (
          <View style={styles.privateWrap}>
            <Ionicons name="lock-closed" size={44} color={colors.mutedForeground} />
            <Text style={[styles.privateTitle, { color: colors.foreground }]}>This account is private</Text>
            <Text style={[styles.privateSub, { color: colors.mutedForeground }]}>Follow to see their photos and videos</Text>
          </View>
        ) : (
          <>
            {/* 7 ── Pinned post spotlight */}
            {pinnedPost ? (
              <PinnedPostCard
                post={pinnedPost}
                onPress={() => setMediaViewer({ visible: true, startIndex: pinnedIndex })}
              />
            ) : null}

            {/* 6 ── Content tabs with sliding indicator */}
            <ContentTabBar
              activeTab={activeTab}
              onTabChange={handleTabChange}
              tabScrollX={tabScrollX}
            />

            {/* Horizontal swipeable pager — each page is W wide */}
            <View style={{ height: pagerHeight }}>
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                decelerationRate="fast"
                onScroll={(e) => {
                  tabScrollX.setValue(e.nativeEvent.contentOffset.x);
                }}
                onMomentumScrollEnd={(e) => {
                  const idx = Math.round(e.nativeEvent.contentOffset.x / W);
                  const tabs: ("posts" | "reels" | "polls")[] = ["posts", "reels", "polls"];
                  setActiveTab(tabs[idx] ?? "posts");
                }}
                style={{ width: W }}
                contentContainerStyle={{ width: W * 3 }}
              >
                {/* Page 0 – Posts */}
                <View style={{ width: W }}>
                  {gridPosts.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 48 }}>
                      <Ionicons name="images-outline" size={48} color="rgba(255,255,255,0.18)" />
                    </View>
                  ) : (
                    <View style={styles.grid}>
                      {gridPosts.map((item) => (
                        <ProfileGridThumb
                          key={item.id}
                          item={item}
                          onPress={() => setMediaViewer({ visible: true, startIndex: gridData.findIndex(d => d.id === item.id) })}
                        />
                      ))}
                    </View>
                  )}
                </View>

                {/* Page 1 – Reels */}
                <View style={{ width: W }}>
                  {gridReels.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 48 }}>
                      <Ionicons name="play-circle-outline" size={48} color="rgba(255,255,255,0.18)" />
                    </View>
                  ) : (
                    <View style={styles.grid}>
                      {gridReels.map((item) => (
                        <ProfileGridThumb
                          key={item.id}
                          item={item}
                          onPress={() => setMediaViewer({ visible: true, startIndex: gridData.findIndex(d => d.id === item.id) })}
                        />
                      ))}
                    </View>
                  )}
                </View>

                {/* Page 2 – Polls */}
                <View style={{ width: W }}>
                  {profilePolls.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 48, gap: 10 }}>
                      <Ionicons name="bar-chart-outline" size={48} color="rgba(255,255,255,0.18)" />
                      <Text style={{ fontFamily: "Poppins_400Regular", fontSize: 14, color: "rgba(255,255,255,0.35)", textAlign: "center" }}>
                        No polls yet
                      </Text>
                    </View>
                  ) : (
                    profilePolls.map((item) => (
                      <ProfilePollRow key={item.id} item={item} userId={myId ?? null} />
                    ))
                  )}
                </View>
              </ScrollView>
            </View>
          </>
        )}
      </ScrollView>

      {/* Top bar — absolute, sits over the dark background */}
      <View style={[styles.topBarAbsolute, { paddingTop: topPad }]} pointerEvents="box-none">
        <View style={styles.topBarInner}>
          <TouchableOpacity onPress={() => router.back()} style={styles.topBarBtn}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle} numberOfLines={1}>@{u}</Text>
          <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.topBarBtn}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* 5 ── Floating Follow / Message / ❤️ bar */}
      <View style={[styles.floatingBar, { bottom: floatingBarBottom }]}>
        <TouchableOpacity
          onPress={handleFollow}
          activeOpacity={0.85}
          style={[styles.floatFollow, following ? styles.floatFollowOutlined : {}]}
        >
          {following ? null : (
            <LinearGradient
              colors={["#F97316", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
              pointerEvents="none"
            />
          )}
          <Text style={[styles.floatFollowText, { color: following ? "#F97316" : "#fff" }]}>
            {followSaving ? "…" : following ? "Following ✓" : "Follow"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleMessage}
          disabled={openingChat}
          style={[styles.floatMsg, { opacity: openingChat ? 0.6 : 1 }]}
          activeOpacity={0.85}
        >
          <Ionicons name="chatbubble" size={16} color="#fff" />
          <Text style={styles.floatMsgText}>{openingChat ? "Opening…" : "Message"}</Text>
        </TouchableOpacity>

        {!BLOCKED_RS.includes((profile as any)?.relationship_status ?? "") && (
          vibeReqStatus === "accepted" ? (
            <View style={[styles.floatVibe, styles.floatVibeAccepted]}>
              <Text style={{ fontSize: 15 }}>💜</Text>
              <Text style={[styles.vibeReqText, { color: "#A78BFA" }]}>Vibing</Text>
            </View>
          ) : vibeReqStatus === "pending" ? (
            <View style={[styles.floatVibe, styles.floatVibePending]}>
              <Text style={{ fontSize: 15 }}>⏳</Text>
              <Text style={[styles.vibeReqText, { color: "#9CA3AF" }]}>Pending</Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={handleVibeRequest}
              disabled={vibeReqLoading}
              style={[styles.floatVibe, { opacity: vibeReqLoading ? 0.6 : 1 }]}
              activeOpacity={0.85}
            >
              <Text style={{ fontSize: 15 }}>✨</Text>
              <Text style={styles.vibeReqText}>Vibe</Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <ThreeDotsModal
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        username={u}
        userId={profile?.id}
        myId={myId}
        onBlocked={() => { setIsBlocked(true); router.back(); }}
        onRestricted={() => {}}
      />

      <FullScreenMediaViewer
        items={gridData}
        startIndex={mediaViewer.startIndex}
        visible={mediaViewer.visible}
        onClose={() => setMediaViewer((s) => ({ ...s, visible: false }))}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const notFoundSt = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  title: { fontSize: 22, fontFamily: "Poppins_700Bold" },
  sub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  backBtn: { marginTop: 16, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  backBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 15 },
});

const menuStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  option: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 0.5 },
  optionText: { fontFamily: "Poppins_500Medium", fontSize: 15 },
  cancelBtn: { paddingVertical: 16, alignItems: "center", borderTopWidth: 0.5, marginTop: 4 },
  cancelText: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  reportTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, paddingHorizontal: 24, paddingVertical: 14 },
});

const vpStyles = StyleSheet.create({
  statusPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(124,58,237,0.14)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(124,58,237,0.28)", alignSelf: "flex-start", marginTop: 6, maxWidth: W - 48 },
  statusLabel: { color: "rgba(255,255,255,0.82)", fontFamily: "Poppins_500Medium", fontSize: 12, flexShrink: 1 },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Top bar (absolute)
  topBarAbsolute: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 20 },
  topBarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  topBarBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, textAlign: "center", fontFamily: "Poppins_600SemiBold", fontSize: 15, color: "#fff" },

  // Static top bar (for error screens)
  topBarStatic: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontFamily: "Poppins_700Bold", fontSize: 16 },

  // Blocked banner
  blockedBanner: { backgroundColor: "#EF4444", padding: 10, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, borderRadius: 10 },
  blockedText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 12, flex: 1 },

  // Profile card
  profileCard: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center", paddingVertical: 4, paddingHorizontal: 4 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: -2 },

  // Bio
  bioSection: { gap: 4, marginBottom: 10 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  fullName: { fontFamily: "Poppins_700Bold", fontSize: 17 },
  handle: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  pronounsBadge: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, borderWidth: 1, backgroundColor: "rgba(80,50,150,0.15)", borderColor: "rgba(140,100,230,0.35)" },
  pronounsText: { fontFamily: "Poppins_500Medium", fontSize: 12, color: "#c4b5fd" },
  bio: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  partnerBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "rgba(236,72,153,0.1)",
    borderWidth: 1, borderColor: "rgba(236,72,153,0.25)",
    borderRadius: 20, paddingVertical: 5, paddingHorizontal: 10,
    alignSelf: "flex-start", marginTop: 2,
  },
  partnerAvatarSmall: { width: 26, height: 26, borderRadius: 13 },
  partnerAvatarFallback: { backgroundColor: "rgba(236,72,153,0.15)", alignItems: "center", justifyContent: "center" },
  partnerEmoji: { fontSize: 13 },
  partnerHandle: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#EC4899" },
  mutuals: { fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 18 },
  websiteRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  websiteText: { color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 13 },

  // Floating action bar
  floatingBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    backgroundColor: "rgba(10,10,20,0.88)",
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12,
    zIndex: 30,
  },
  floatFollow: {
    flex: 1,
    height: 40,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  floatFollowOutlined: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#F97316",
  },
  floatFollowText: { fontFamily: "Poppins_700Bold", fontSize: 14, zIndex: 1 },
  floatMsg: {
    flex: 1,
    height: 40,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  floatMsgText: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  floatVibe: {
    width: 44,
    height: 40,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(124,58,237,0.18)",
    borderWidth: 1,
    borderColor: "rgba(124,58,237,0.4)",
  },
  floatVibeSent: { backgroundColor: "rgba(124,58,237,0.35)", borderColor: "#7C3AED" },
  floatVibePending: { backgroundColor: "rgba(107,114,128,0.15)", borderColor: "rgba(107,114,128,0.38)" },
  floatVibeAccepted: { backgroundColor: "rgba(124,58,237,0.45)", borderColor: "#7C3AED" },
  vibeReqText: {
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
    color: "#E2D8FF",
  },

  // Private
  privateWrap: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  privateTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  privateSub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },

  // Grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1.5 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative" },
  gridImage: { width: "100%", height: "100%", backgroundColor: "#111" },
  videoOverlay: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, padding: 3 },
  pinOverlay: { position: "absolute", top: 6, left: 6 },
  gridLikeRow: { position: "absolute", bottom: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  gridLikes: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});
