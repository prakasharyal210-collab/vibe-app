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
  blockUser,
  checkIsFollowing,
  fetchProfilePosts,
  isUserBlocked,
  lookupProfileByUsername,
  ProfileGridItem,
  PublicProfile,
  reportContent,
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

function ThreeDotsModal({ visible, onClose, username, userId, myId, onBlocked }: {
  visible: boolean;
  onClose: () => void;
  username: string;
  userId?: string;
  myId?: string;
  onBlocked?: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [showReport, setShowReport] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [reporting, setReporting] = useState<string | null>(null);

  const handleBlock = async () => {
    if (!myId) { Alert.alert("Sign in to block users"); return; }
    setBlocking(true);
    try {
      await blockUser(myId, userId ?? username);
      onClose();
      onBlocked?.();
      Alert.alert("Blocked", `You blocked @${username}. They won't see your content.`);
    } catch {
      Alert.alert("Error", "Could not complete action. Try again.");
    } finally {
      setBlocking(false);
    }
  };

  const handleReport = async (reason: string) => {
    if (!myId) { Alert.alert("Sign in to report users"); return; }
    setReporting(reason);
    try {
      await reportContent(myId, username, "user", reason);
      setShowReport(false);
      onClose();
      Alert.alert("Reported", "Thank you. Our team will review this account within 24 hours.");
    } catch {
      Alert.alert("Error", "Could not submit report. Try again.");
    } finally {
      setReporting(null);
    }
  };

  const options: { icon: string; label: string; action: () => void; destructive?: boolean }[] = [
    { icon: "share-social-outline", label: "Share Profile", action: () => Alert.alert("Share", `Share @${username}'s profile`) },
    { icon: "copy-outline", label: "Copy Profile Link", action: () => Alert.alert("Copied!", `vibe.app/@${username} copied to clipboard`) },
    { icon: "person-remove-outline", label: blocking ? "Blocking..." : "Block @" + username, action: handleBlock, destructive: true },
    { icon: "flag-outline", label: "Report User", action: () => setShowReport(true), destructive: true },
    { icon: "eye-off-outline", label: "Restrict User", action: () => { Alert.alert("Restricted", `@${username} won't know they're restricted`); onClose(); } },
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
                  {reporting === reason ? "Submitting..." : reason}
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

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { session } = useAuth();
  const myId = session?.user?.id;
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [following, setFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<ProfileGridItem[]>([]);
  const [activeTab, setActiveTab] = useState<"posts" | "reels" | "tagged">("posts");
  const [showMenu, setShowMenu] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<{ visible: boolean; startIndex: number }>({ visible: false, startIndex: 0 });

  const u = username ?? "";

  useEffect(() => {
    if (!u) return;
    lookupProfileByUsername(u).then((p) => { if (p) setProfile(p); }).catch(() => {});
  }, [u]);

  useEffect(() => {
    if (!profile?.id) return;
    fetchProfilePosts(profile.id).then(setPosts).catch(() => {});
  }, [profile?.id]);

  useEffect(() => {
    if (!myId || !profile?.id) return;
    checkIsFollowing(myId, profile.id).then(setFollowing).catch(() => {});
    isUserBlocked(myId, profile.id).then(setIsBlocked).catch(() => {});
  }, [myId, profile?.id]);

  const handleFollow = async () => {
    if (!myId || !profile?.id) return;
    const nowFollowing = !following;
    setFollowing(nowFollowing);
    try {
      if (nowFollowing) {
        await supabase.from("follows").insert({ follower_id: myId, following_id: profile.id });
      } else {
        await supabase.from("follows").delete().eq("follower_id", myId).eq("following_id", profile.id);
      }
    } catch {}
  };

  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;
  const mutualText = null;

  const userData = {
    fullName: (profile as any)?.display_name ?? u.replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    bio: profile?.bio ?? "",
    website: profile?.website,
    followers: profile?.followers_count ?? 0,
    following: profile?.following_count ?? 0,
    posts: profile?.posts_count ?? posts.length,
    isVerified: profile?.is_verified ?? false,
    isPrivate: profile?.is_private ?? false,
    location: profile?.location ?? "",
    mutualFollowers: [] as string[],
    followsYou: false,
    coverSeed: `${u}cover`,
    highlights: [] as { label: string; image: string }[],
  };

  const gridData: Array<{ id: string; image: string; likes: number; caption?: string; isVideo?: boolean; username: string }> = posts.map((p) => ({
    id: p.id,
    image: p.image_url || `https://picsum.photos/seed/${p.id}/400/400`,
    likes: p.likes,
    caption: p.caption,
    isVideo: p.isReel,
    username: u,
  }));

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
          <Image
            source={{ uri: `https://picsum.photos/seed/${userData.coverSeed}/600/300` }}
            style={styles.coverPhoto}
            resizeMode="cover"
          />
          <LinearGradient
            colors={["transparent", "rgba(0,0,0,0.5)"]}
            style={StyleSheet.absoluteFill}
          />
        </View>

        <View style={[styles.profileCard, { backgroundColor: colors.background }]}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <LinearGradient
                colors={["#7C3AED", "#F97316"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.avatarRing}
              >
                <View style={[styles.avatarInner, { backgroundColor: colors.background }]}>
                  <UserAvatar username={u} size={76} />
                </View>
              </LinearGradient>
            </View>

            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => router.push(`/followers/${u}?type=followers` as any)}
              >
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.posts)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Posts</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => router.push(`/followers/${u}?type=followers` as any)}
              >
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.followers)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Followers</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.statBox}
                onPress={() => router.push(`/followers/${u}?type=following` as any)}
              >
                <Text style={[styles.statValue, { color: colors.foreground }]}>{formatCount(userData.following)}</Text>
                <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Following</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.bioSection}>
            <View style={styles.nameRow}>
              <Text style={[styles.fullName, { color: colors.foreground }]}>{userData.fullName}</Text>
              {userData.isVerified && (
                <Ionicons name="checkmark-circle" size={17} color="#7C3AED" />
              )}
              {userData.followsYou && (
                <View style={[styles.followsYouPill, { backgroundColor: "rgba(124,58,237,0.15)" }]}>
                  <Text style={styles.followsYouText}>Follows you</Text>
                </View>
              )}
            </View>
            <Text style={[styles.handle, { color: colors.mutedForeground }]}>@{u}</Text>

            {userData.location ? (
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
                <Text style={[styles.locationText, { color: colors.mutedForeground }]}>{userData.location}</Text>
              </View>
            ) : null}

            {userData.bio ? (
              <Text style={[styles.bio, { color: colors.foreground }]}>{userData.bio}</Text>
            ) : null}

            {userData.website ? (
              <TouchableOpacity onPress={() => Linking.openURL(`https://${userData.website}`)} style={styles.websiteRow}>
                <Ionicons name="link-outline" size={13} color="#7C3AED" />
                <Text style={styles.websiteText}>{userData.website}</Text>
              </TouchableOpacity>
            ) : null}

            {mutualText ? (
              <View style={styles.mutualRow}>
                <View style={styles.mutualAvatars}>
                  {userData.mutualFollowers.slice(0, 2).map((mu, i) => (
                    <View key={mu} style={[styles.mutualAvatar, { marginLeft: i > 0 ? -10 : 0, zIndex: 2 - i }]}>
                      <UserAvatar username={mu} size={20} />
                    </View>
                  ))}
                </View>
                <Text style={[styles.mutualText, { color: colors.mutedForeground }]}>{mutualText}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              onPress={handleFollow}
              style={[
                styles.followBtn,
                following && { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
              ]}
              activeOpacity={0.85}
            >
              {following ? (
                <Text style={[styles.followBtnText, { color: colors.foreground }]}>Following ✓</Text>
              ) : (
                <LinearGradient
                  colors={["#7C3AED", "#EA580C"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.followGrad}
                >
                  <Text style={[styles.followBtnText, { color: "#fff" }]}>Follow</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push({ pathname: "/chat/[userId]", params: { userId: u, username: u } })}
              style={[styles.msgBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            >
              <Ionicons name="chatbubble-outline" size={15} color={colors.foreground} />
              <Text style={[styles.msgBtnText, { color: colors.foreground }]}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert("💜 Vibe Sent!", `You sent a vibe to ${userData.fullName}`)}
              style={[styles.vibeBtn, { backgroundColor: "rgba(124,58,237,0.1)", borderColor: "rgba(124,58,237,0.4)" }]}
            >
              <Text style={styles.vibeBtnText}>💜</Text>
            </TouchableOpacity>
          </View>
        </View>

        {userData.isPrivate ? (
          <View style={styles.privateWrap}>
            <Ionicons name="lock-closed" size={44} color={colors.mutedForeground} />
            <Text style={[styles.privateTitle, { color: colors.foreground }]}>This account is private</Text>
            <Text style={[styles.privateSub, { color: colors.mutedForeground }]}>
              Follow to see their photos and videos
            </Text>
          </View>
        ) : (
          <>
            {userData.highlights.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.highlightsRow}
              >
                {userData.highlights.map((hl, i) => (
                  <TouchableOpacity key={i} style={styles.highlightItem} activeOpacity={0.8}>
                    <LinearGradient
                      colors={["#7C3AED", "#F97316"]}
                      style={styles.highlightRing}
                    >
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
                <TouchableOpacity
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={styles.tabBtn}
                >
                  <Ionicons
                    name={tab.icon}
                    size={22}
                    color={activeTab === tab.id ? "#7C3AED" : colors.mutedForeground}
                  />
                  {activeTab === tab.id && <View style={styles.tabIndicator} />}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.grid}>
              {gridData.map((item, i) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.gridItem}
                  activeOpacity={0.88}
                  onPress={() => setMediaViewer({ visible: true, startIndex: i })}
                >
                  <Image source={{ uri: item.image }} style={styles.gridImage} resizeMode="cover" />
                  {item.isVideo && (
                    <View style={styles.videoOverlay} pointerEvents="none">
                      <Ionicons name="play" size={18} color="#fff" />
                    </View>
                  )}
                  <View style={styles.gridLikeRow} pointerEvents="none">
                    <Ionicons name="heart" size={12} color="#fff" />
                    <Text style={styles.gridLikes}>
                      {(item.likes ?? 0) >= 1000 ? `${((item.likes ?? 0) / 1000).toFixed(1)}k` : item.likes}
                    </Text>
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

const menuStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  option: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 0.5 },
  optionText: { fontFamily: "Poppins_500Medium", fontSize: 15 },
  cancelBtn: { paddingVertical: 16, alignItems: "center", borderTopWidth: 0.5, marginTop: 4 },
  cancelText: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  reportTitle: { fontFamily: "Poppins_700Bold", fontSize: 15, paddingHorizontal: 24, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 8,
    zIndex: 10,
  },
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
  followsYouPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  followsYouText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  handle: { fontFamily: "Poppins_400Regular", fontSize: 13 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  bio: { fontFamily: "Poppins_400Regular", fontSize: 13, lineHeight: 20 },
  websiteRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  websiteText: { color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  mutualRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  mutualAvatars: { flexDirection: "row" },
  mutualAvatar: { borderRadius: 12, overflow: "hidden", borderWidth: 1.5, borderColor: "#0A0A0F" },
  mutualText: { fontFamily: "Poppins_400Regular", fontSize: 11, flex: 1 },
  actionRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  followBtn: { flex: 2.2, height: 38, borderRadius: 10, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  followGrad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  followBtnText: { fontFamily: "Poppins_700Bold", fontSize: 14 },
  msgBtn: { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderRadius: 10, height: 38, borderWidth: 0.5 },
  msgBtnText: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  vibeBtn: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 10, borderWidth: 1 },
  vibeBtnText: { fontSize: 18 },
  privateWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 40, gap: 12 },
  privateTitle: { fontFamily: "Poppins_700Bold", fontSize: 17 },
  privateSub: { fontFamily: "Poppins_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  highlightsRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },
  highlightItem: { alignItems: "center", gap: 5 },
  highlightRing: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  highlightInner: { width: 62, height: 62, borderRadius: 31, overflow: "hidden" },
  highlightImage: { width: "100%", height: "100%" },
  highlightLabel: { fontFamily: "Poppins_400Regular", fontSize: 11, textAlign: "center" },
  tabRow: { flexDirection: "row", borderTopWidth: 0.5, borderBottomWidth: 0.5, marginBottom: 1 },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: 11, position: "relative" },
  tabIndicator: { position: "absolute", top: 0, left: 16, right: 16, height: 2, backgroundColor: "#7C3AED", borderRadius: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 1.5 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, position: "relative" },
  gridImage: { width: "100%", height: "100%" },
  videoOverlay: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 10, padding: 3 },
  gridLikeRow: { position: "absolute", bottom: 6, left: 6, flexDirection: "row", alignItems: "center", gap: 3 },
  gridLikes: {
    color: "#fff",
    fontFamily: "Poppins_600SemiBold",
    fontSize: 11,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
