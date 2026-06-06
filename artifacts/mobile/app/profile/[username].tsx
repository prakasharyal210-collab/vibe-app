import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullScreenMediaViewer, MediaItem } from "@/components/FullScreenMediaViewer";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import {
  amIBlockedBy,
  blockUser,
  checkIsFollowing,
  fetchProfilePosts,
  getOrCreateConversation,
  isUserBlocked,
  lookupProfileByUsername,
  ProfileGridItem,
  PublicProfile,
  reportContent,
  restrictUser,
  sendVibeRequest,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";

const { width: W } = Dimensions.get("window");
const GRID_SIZE = (W - 3) / 3;
const COVER_H = 150;

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
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

  const handleBlock = () => {
    if (!myId) { Alert.alert("Sign in to block users"); return; }
    Alert.alert(
      `Block @${username}?`,
      `They won't be able to see your posts or find you on Vibe. They won't be notified.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await blockUser(myId, userId ?? username);
              onClose();
              onBlocked?.();
            } catch {
              Alert.alert("Error", "Could not block user. Try again.");
            } finally { setBusy(false); }
          },
        },
      ]
    );
  };

  const handleRestrict = () => {
    if (!myId) { Alert.alert("Sign in to restrict users"); return; }
    Alert.alert(
      `Restrict @${username}?`,
      `Their comments will be hidden from others. They won't know they've been restricted and can still see your posts.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restrict",
          onPress: async () => {
            setBusy(true);
            try {
              await restrictUser(myId, userId ?? username);
              onClose();
              onRestricted?.();
              Alert.alert("Restricted", `@${username} has been restricted.`);
            } catch {
              Alert.alert("Error", "Could not restrict user. Try again.");
            } finally { setBusy(false); }
          },
        },
      ]
    );
  };

  const handleReport = async (reason: string) => {
    if (!myId) { Alert.alert("Sign in to report users"); return; }
    setReporting(reason);
    try {
      await reportContent(myId, username, "user", reason);
      setShowReport(false);
      onClose();
      Alert.alert("Reported ✅", "Thank you. Our team will review this account within 24 hours.");
    } catch {
      Alert.alert("Error", "Could not submit report. Try again.");
    } finally { setReporting(null); }
  };

  const options: { icon: string; label: string; action: () => void; destructive?: boolean }[] = [
    { icon: "share-social-outline", label: "Share Profile", action: () => Alert.alert("Share", `Share @${username}'s profile`) },
    { icon: "copy-outline", label: "Copy Profile Link", action: () => Alert.alert("Copied!", `vibe.app/@${username} copied to clipboard`) },
    { icon: "person-remove-outline", label: busy ? "Please wait…" : `Block @${username}`, action: handleBlock, destructive: true },
    { icon: "eye-off-outline", label: `Restrict @${username}`, action: handleRestrict, destructive: true },
    { icon: "flag-outline", label: "Report User", action: () => setShowReport(true), destructive: true },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={menuStyles.overlay} activeOpacity={1} onPress={onClose} />
      <View style={[menuStyles.sheet, { backgroundColor: colors.card, paddingBottom: Platform.OS === "web" ? 20 : insets.bottom + 8 }]}>
        <View style={[menuStyles.handle, { backgroundColor: colors.border }]} />
        {!showReport ? (
          <>
            {options.map((opt, i) => (
              <TouchableOpacity
                key={i}
                onPress={opt.action}
                disabled={busy}
                style={[menuStyles.option, { borderBottomColor: colors.border }]}
              >
                <Ionicons name={opt.icon as any} size={20} color={opt.destructive ? "#EF4444" : colors.foreground} />
                <Text style={[menuStyles.optionText, { color: opt.destructive ? "#EF4444" : colors.foreground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={[menuStyles.reportTitle, { color: colors.foreground }]}>Why are you reporting this account?</Text>
            {REPORT_REASONS.map((reason) => (
              <TouchableOpacity
                key={reason}
                onPress={() => handleReport(reason)}
                disabled={!!reporting}
                style={[menuStyles.option, { borderBottomColor: colors.border, opacity: reporting === reason ? 0.5 : 1 }]}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                <Text style={[menuStyles.optionText, { color: colors.foreground }]}>
                  {reporting === reason ? "Submitting…" : reason}
                </Text>
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
  const [vibeSent, setVibeSent] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfileGridItem[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "tagged">("posts");
  const [showMenu, setShowMenu] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; startIndex: number }>({ visible: false, startIndex: 0 });
  const [profileLoaded, setProfileLoaded] = useState(false);

  const u = username ?? "";
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  useEffect(() => {
    if (!u) return;
    lookupProfileByUsername(u)
      .then((p) => {
        if (p) {
          setProfile(p);
          setFollowersCount(p.followers_count ?? 0);
        }
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, [u]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchProfilePosts(profile.id).then(setPosts).catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    if (!myId || !profile?.id) return;
    checkIsFollowing(myId, profile.id).then(setFollowing).catch(() => {});
    isUserBlocked(myId, profile.id).then(setIsBlocked).catch(() => {});
    amIBlockedBy(myId, profile.id).then(setAmBlocked).catch(() => {});
  }, [myId, profile?.id]);

  // ── Follow / Unfollow ──────────────────────────────────────────────────────
  const handleFollow = async () => {
    if (!myId || !profile?.id || followSaving) return;
    const wasFollowing = following;
    // Optimistic update — instant feedback
    setFollowing(!wasFollowing);
    setFollowersCount((n) => (!wasFollowing ? n + 1 : Math.max(0, n - 1)));
    setFollowSaving(true);
    try {
      // Try toggle_follow RPC first (handles duplicates gracefully)
      const { error } = await supabase.rpc("toggle_follow", {
        p_follower_id: myId,
        p_following_id: profile.id,
      });
      if (error) throw error;
    } catch {
      // Fallback to direct table operations
      try {
        if (!wasFollowing) {
          await supabase.from("follows").upsert(
            { follower_id: myId, following_id: profile.id },
            { onConflict: "follower_id,following_id" }
          );
        } else {
          await supabase.from("follows").delete()
            .eq("follower_id", myId).eq("following_id", profile.id);
        }
      } catch {
        // Revert optimistic update on total failure
        setFollowing(wasFollowing);
        setFollowersCount((n) => (wasFollowing ? n + 1 : Math.max(0, n - 1)));
      }
    } finally {
      setFollowSaving(false);
    }
  };

  // ── Open Chat ──────────────────────────────────────────────────────────────
  const handleMessage = async () => {
    if (!myId || !profile?.id || openingChat) return;
    setOpeningChat(true);
    try {
      const convId = await getOrCreateConversation(myId, profile.id);
      if (convId) {
        router.push({
          pathname: "/chat/[userId]",
          params: {
            userId: convId,
            username: u,
            avatar_url: profile.avatar_url ?? "",
          },
        } as any);
      } else {
        // Fallback: navigate with username
        router.push({ pathname: "/chat/[userId]", params: { userId: profile.id, username: u } });
      }
    } catch {
      router.push({ pathname: "/chat/[userId]", params: { userId: profile.id, username: u } });
    } finally {
      setOpeningChat(false);
    }
  };

  // ── Send Vibe ──────────────────────────────────────────────────────────────
  const handleVibe = async () => {
    if (!myId || !profile?.id || vibeSent) return;
    setVibeSent(true);
    const result = await sendVibeRequest(myId, profile.id);
    if (result === "matched") {
      Alert.alert("🎉 It's a Match!", `You and ${userData.fullName} both vibed each other!`, [
        { text: "Send Message 💬", onPress: handleMessage },
        { text: "Later", style: "cancel" },
      ]);
    } else {
      // result === "pending"
      Alert.alert("💜 Vibe Sent!", `Your vibe was sent to ${userData.fullName}. If they vibe back, it's a match!`);
    }
    setTimeout(() => setVibeSent(false), 10000);
  };

  const userData = {
    fullName: (profile as any)?.display_name ?? u.replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    bio: profile?.bio ?? "",
    website: profile?.website,
    followers: followersCount,
    following: profile?.following_count ?? 0,
    posts: profile?.posts_count ?? posts.length,
    isVerified: profile?.is_verified ?? false,
    isPrivate: profile?.is_private ?? false,
    location: profile?.location ?? "",
    coverSeed: `${u}cover`,
    highlights: [] as { label: string; image: string }[],
  };

  const gridData = posts.map((p) => ({
    id: p.id,
    image: p.image_url || `https://picsum.photos/seed/${p.id}/400/400`,
    likes: p.likes,
    caption: p.caption,
    isVideo: p.isReel,
    username: u,
  }));

  // ── "User not found" — they blocked me ───────────────────────────────────────
  if (profileLoaded && amBlocked) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.topBar, { paddingTop: topPad, backgroundColor: colors.background }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.foreground }]}>Profile</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={notFoundSt.wrap}>
          <Text style={{ fontSize: 64 }}>🔍</Text>
          <Text style={[notFoundSt.title, { color: colors.foreground }]}>User not found</Text>
          <Text style={[notFoundSt.sub, { color: colors.mutedForeground }]}>
            This account doesn't exist or is unavailable.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={[notFoundSt.backBtn, { borderColor: colors.border }]}>
            <Text style={[notFoundSt.backBtnText, { color: colors.foreground }]}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { paddingTop: topPad, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.foreground }]} numberOfLines={1}>{u}</Text>
        <TouchableOpacity onPress={() => setShowMenu(true)} style={styles.iconBtn}>
          <Ionicons name="ellipsis-horizontal" size={22} color={colors.foreground} />
        </TouchableOpacity>
      </View>

      {isBlocked && (
        <View style={{ backgroundColor: "#EF4444", padding: 12, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
          <Ionicons name="ban" size={18} color="#fff" />
          <Text style={{ color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 13, flex: 1 }}>
            You have blocked @{u}. They can't see your content.
          </Text>
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.coverWrap}>
          <Image source={{ uri: `https://picsum.photos/seed/${userData.coverSeed}/600/300` }} style={styles.coverPhoto} resizeMode="cover" />
          <LinearGradient colors={["transparent", "rgba(0,0,0,0.5)"]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={[styles.profileCard, { backgroundColor: colors.background }]}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <LinearGradient colors={["#7C3AED", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.avatarRing}>
                <View style={[styles.avatarInner, { backgroundColor: colors.background }]}>
                  <UserAvatar username={u} size={76} />
                </View>
              </LinearGradient>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity style={styles.statBox} onPress={() => router.push(`/followers/${u}?type=followers` as any)}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.posts)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statBox} onPress={() => router.push(`/followers/${u}?type=followers` as any)}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.followers)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statBox} onPress={() => router.push(`/followers/${u}?type=following` as any)}>
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.following)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.bioSection}>
            <View style={styles.nameRow}>
              <Text style={[styles.fullName, { color: colors.foreground }]}>{userData.fullName}</Text>
              {userData.isVerified && <Ionicons name="checkmark-circle" size={17} color="#7C3AED" />}
            </View>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{u}</Text>
            {userData.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{userData.location}</Text>
              </View>
            ) : null}
            {userData.bio ? <Text style={[styles.bio, { color: colors.foreground }]}>{userData.bio}</Text> : null}
            {userData.website ? (
              <TouchableOpacity onPress={() => Linking.openURL(`https://${userData.website}`)} style={styles.websiteRow}>
                <Ionicons name="link-outline" size={13} color="#7C3AED" />
                <Text style={styles.websiteText}>{userData.website}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            {/* ── Follow button — gradient uses pointerEvents=none so TouchableOpacity stays tappable ── */}
            <TouchableOpacity
              onPress={handleFollow}
              activeOpacity={0.8}
              style={[
                styles.followBtn,
                following
                  ? { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#7C3AED" }
                  : { backgroundColor: "#7C3AED" },
              ]}
            >
              {following ? (
                <Text style={[styles.followBtnText, { color: "#7C3AED" }]}>
                  {followSaving ? "…" : "Following ✓"}
                </Text>
              ) : (
                <>
                  {/* Gradient as decoration only — touch handled by parent */}
                  <LinearGradient
                    colors={["#7C3AED", "#EA580C"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <Text style={[styles.followBtnText, { color: "#fff" }]}>
                    {followSaving ? "…" : "Follow"}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {/* ── Message button ── */}
            <TouchableOpacity
              onPress={handleMessage}
              disabled={openingChat}
              style={[styles.msgBtn, { backgroundColor: colors.muted, borderColor: colors.border, opacity: openingChat ? 0.6 : 1 }]}
              activeOpacity={0.8}
            >
              <Ionicons name="chatbubble-outline" size={15} color={colors.foreground} />
              <Text style={[styles.msgBtnText, { color: colors.foreground }]}>
                {openingChat ? "Opening…" : "Message"}
              </Text>
            </TouchableOpacity>

            {/* ── Vibe button ── */}
            <TouchableOpacity
              onPress={handleVibe}
              disabled={vibeSent}
              style={[
                styles.vibeBtn,
                vibeSent
                  ? { backgroundColor: "rgba(124,58,237,0.25)", borderColor: "#7C3AED" }
                  : { backgroundColor: "rgba(124,58,237,0.1)", borderColor: "rgba(124,58,237,0.4)" },
              ]}
              activeOpacity={0.8}
            >
              <Text style={styles.vibeBtnText}>{vibeSent ? "✅" : "💜"}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {userData.isPrivate ? (
          <View style={styles.privateWrap}>
            <Ionicons name="lock-closed" size={44} color={colors.mutedForeground} />
            <Text style={[styles.privateTitle, { color: colors.foreground }]}>This account is private</Text>
            <Text style={[styles.privateSub, { color: colors.mutedForeground }]}>Follow to see their photos and videos</Text>
          </View>
        ) : (
          <>
            {userData.highlights.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightsRow}>
                {userData.highlights.map((hl, i) => (
                  <TouchableOpacity key={i} style={styles.highlightItem} activeOpacity={0.8}>
                    <LinearGradient colors={["#7C3AED", "#F97316"]} style={styles.highlightRing}>
                      <View style={[styles.highlightInner, { backgroundColor: colors.background }]}>
                        <Image source={{ uri: hl.image }} style={styles.highlightImage} />
                      </View>
                    </LinearGradient>
                    <Text style={[styles.highlightLabel, { color: colors.foreground }]}>{hl.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={[styles.tabRow, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
              {([
                { id: "posts", icon: "grid-outline" as const },
                { id: "reels", icon: "film-outline" as const },
                { id: "tagged", icon: "person-outline" as const },
              ] as const).map((tab) => (
                <TouchableOpacity key={tab.id} onPress={() => setActiveTab(tab.id)} style={styles.tabBtn}>
                  <Ionicons name={tab.icon} size={22} color={activeTab === tab.id ? "#7C3AED" : colors.mutedForeground} />
                  {activeTab === tab.id && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.grid}>
              {gridData.map((item, i) => (
                <TouchableOpacity key={item.id} style={styles.gridItem} activeOpacity={0.88} onPress={() => setMediaViewer({ visible: true, startIndex: i })}>
                  <Image source={{ uri: item.image }} style={styles.gridImage} resizeMode="cover" />
                  {item.isVideo && (
                    <View style={styles.videoOverlay} pointerEvents="none">
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>
                  )}
                  <View style={styles.gridLikeRow} pointerEvents="none">
                    <Ionicons name="heart" size={12} color="#fff" />
                    <Text style={styles.gridLikes}>{(item.likes ?? 0) >= 1000 ? `${((item.likes ?? 0) / 1000).toFixed(1)}k` : item.likes}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

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

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 8, zIndex: 10 },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topTitle: { flex: 1, textAlign: "center", fontFamily: "Poppins_700Bold", fontSize: 16 },
  coverWrap: { height: COVER_H, position: "relative" },
  coverPhoto: { width: "100%", height: "100%" },
  profileCard: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 },
  avatarWrap: {},
  avatarRing: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  avatarInner: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center" },
  statsRow: { flex: 1, flexDirection: "row", justifyContent: "space-around" },
  statBox: { alignItems: "center", paddingVertical: 4, paddingHorizontal: 6 },
  statValue: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  statLabel: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: -2 },
  bioSection: { gap: 4, marginBottom: 14 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  fullName: { fontFamily: "Poppins_700Bold", fontSize: 16 },
  handle: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  bio: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  websiteRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  websiteText: { color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  followBtn: { flex: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", height: 38, position: "relative", overflow: "visible" },
  followBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14, zIndex: 1 },
  msgBtn: { flex: 1, flexDirection: "row", gap: 6, borderRadius: 12, alignItems: "center", justifyContent: "center", height: 38, borderWidth: 1 },
  msgBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  vibeBtn: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  vibeBtnText: { fontSize: 16 },
  privateWrap: { alignItems: "center", gap: 12, paddingVertical: 60, paddingHorizontal: 32 },
  privateTitle: { fontFamily: "Poppins_700Bold", fontSize: 18 },
  privateSub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center" },
  highlightsRow: { paddingHorizontal: 16, gap: 16, paddingVertical: 12 },
  highlightItem: { alignItems: "center", gap: 4 },
  highlightRing: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  highlightInner: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  highlightImage: { width: "100%", height: "100%" },
  highlightLabel: { fontFamily: "Poppins_400Regular", fontSize: 11 },
  tabRow: { flexDirection: "row", borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 10, position: "relative" },
  tabIndicator: { position: "absolute", bottom: 0, left: "20%", right: "20%", height: 2, backgroundColor: "#7C3AED" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1.5 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative" },
  gridImage: { width: "100%", height: "100%", backgroundColor: "#111" },
  videoOverlay: { position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, padding: 3 },
  gridLikeRow: { position: "absolute", bottom: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  gridLikes: { color: "#fff", fontSize: 11, fontFamily: "Poppins_600SemiBold" },
});
