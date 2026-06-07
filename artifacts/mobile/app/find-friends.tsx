import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  findUsersByEmails,
  getSuggestedUsersForFindFriends,
  searchVibeUsers,
  SocialMatchUser,
  toggleFollowUser,
} from "@/lib/db";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCount(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function makeReferralCode(username: string, userId: string) {
  const uPart = username.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase().padEnd(4, "X");
  const idPart = userId.replace(/-/g, "").slice(-4).toUpperCase();
  return `${uPart}${idPart}`;
}

async function openUrl(url: string) {
  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
  } catch {}
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  myId,
  tag,
  colors,
  onFollowed,
}: {
  user: SocialMatchUser;
  myId: string;
  tag?: string;
  colors: any;
  onFollowed?: (id: string, nowFollowing: boolean) => void;
}) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFollow = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setLoading(true);
    const nowFollowing = await toggleFollowUser(myId, user.id);
    setFollowing(nowFollowing);
    setLoading(false);
    onFollowed?.(user.id, nowFollowing);
  };

  return (
    <TouchableOpacity
      style={[rowS.wrap, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() => router.push(`/profile/${user.username}` as any)}
    >
      <UserAvatar username={user.username} url={user.avatar_url} size={46} />
      <View style={rowS.info}>
        <View style={rowS.nameRow}>
          <Text style={[rowS.username, { color: colors.foreground }]} numberOfLines={1}>
            @{user.username}
          </Text>
          {user.is_verified && <Ionicons name="checkmark-circle" size={13} color="#7C3AED" />}
        </View>
        {user.bio ? (
          <Text style={[rowS.bio, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
        {user.followers_count ? (
          <Text style={[rowS.followers, { color: colors.mutedForeground }]}>
            {fmtCount(user.followers_count)} followers
          </Text>
        ) : null}
        {tag ? <Text style={rowS.tag}>{tag}</Text> : null}
      </View>
      <TouchableOpacity
        style={[
          rowS.btn,
          following
            ? { borderWidth: 1, borderColor: colors.border, backgroundColor: "transparent" }
            : { backgroundColor: "#7C3AED" },
        ]}
        onPress={handleFollow}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={[rowS.btnText, { color: following ? colors.foreground : "#fff" }]}>
            {following ? "Following" : "Follow"}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rowS = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 0.5 },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  bio: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  followers: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  tag: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "#F97316" },
  btn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 9, minWidth: 80, alignItems: "center" },
  btnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
});

// ─── Invite Row (contacts not on Vibe) ────────────────────────────────────────

function InviteRow({
  name,
  phone,
  referralCode,
  colors,
}: {
  name: string;
  phone?: string;
  referralCode: string;
  colors: any;
}) {
  const [invited, setInvited] = useState(false);

  const handleInvite = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const msg = `Hey ${name}! I'm using Gundruk, the new social app 🔥\nJoin me: https://gundruk.app/download\nUse my code: ${referralCode}\nWe both get 100 free coins! 🎁`;
    if (phone) {
      const waUrl = `whatsapp://send?phone=${phone.replace(/\D/g, "")}&text=${encodeURIComponent(msg)}`;
      const waSupported = await Linking.canOpenURL(waUrl).catch(() => false);
      if (waSupported) {
        await Linking.openURL(waUrl).catch(() => {});
        setInvited(true);
        return;
      }
    }
    await Share.share({ message: msg }).catch(() => {});
    setInvited(true);
  };

  return (
    <View style={[invS.row, { borderBottomColor: colors.border }]}>
      <View style={[invS.avatar, { backgroundColor: colors.muted }]}>
        <Text style={invS.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={invS.info}>
        <Text style={[invS.name, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        <Text style={[invS.sub, { color: colors.mutedForeground }]}>Not on Gundruk yet</Text>
      </View>
      <TouchableOpacity
        style={[invS.btn, invited && { opacity: 0.55 }]}
        onPress={handleInvite}
        disabled={invited}
      >
        <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={invS.btnGrad}>
          <Text style={invS.btnText}>{invited ? "Invited ✓" : "Invite"}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const invS = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 0.5 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarLetter: { fontSize: 18, fontFamily: "Poppins_700Bold", color: "#7C3AED" },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  sub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  btn: { borderRadius: 9, overflow: "hidden" },
  btnGrad: { paddingHorizontal: 14, paddingVertical: 7, alignItems: "center" },
  btnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
});

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  emoji,
  title,
  subtitle,
  colors,
  children,
  action,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  colors: any;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <View style={[cardS.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardS.header}>
        <Text style={cardS.emoji}>{emoji}</Text>
        <View style={cardS.headerText}>
          <Text style={[cardS.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? <Text style={[cardS.sub, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

const cardS = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  emoji: { fontSize: 22 },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  sub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
});

// ─── QR Code Modal ────────────────────────────────────────────────────────────

function QRModal({
  visible,
  onClose,
  profileUrl,
  username,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  profileUrl: string;
  username: string;
  colors: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={qrS.overlay}>
        <View style={[qrS.sheet, { backgroundColor: colors.card }]}>
          <TouchableOpacity onPress={onClose} style={qrS.closeBtn}>
            <Ionicons name="close" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[qrS.title, { color: colors.foreground }]}>My Gundruk QR Code</Text>
          <Text style={[qrS.sub, { color: colors.mutedForeground }]}>Friends scan this to follow you instantly</Text>
          <View style={qrS.qrWrap}>
            <LinearGradient
              colors={["rgba(124,58,237,0.2)", "rgba(249,115,22,0.1)"]}
              style={qrS.qrGrad}
            >
              <View style={qrS.qrInner}>
                <QRCode
                  value={profileUrl}
                  size={200}
                  color="#7C3AED"
                  backgroundColor="transparent"
                />
              </View>
            </LinearGradient>
          </View>
          <Text style={[qrS.urlText, { color: colors.mutedForeground }]}>{profileUrl}</Text>
          <TouchableOpacity
            style={qrS.shareBtn}
            onPress={() => {
              Share.share({ message: `Follow me on Gundruk! ${profileUrl}`, title: `@${username} on Gundruk` }).catch(() => {});
            }}
          >
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={qrS.shareBtnGrad}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={qrS.shareBtnText}>Share QR Code</Text>
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[qrS.hint, { color: colors.mutedForeground }]}>Screenshot to save to your camera roll</Text>
        </View>
      </View>
    </Modal>
  );
}

const qrS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { width: "100%", borderRadius: 24, padding: 24, alignItems: "center" },
  closeBtn: { position: "absolute", top: 16, right: 16, zIndex: 10 },
  title: { fontSize: 20, fontFamily: "Poppins_700Bold", marginTop: 4, marginBottom: 4 },
  sub: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", marginBottom: 24 },
  qrWrap: { marginBottom: 16 },
  qrGrad: { borderRadius: 20, padding: 2 },
  qrInner: { backgroundColor: "rgba(255,255,255,0.04)", borderRadius: 18, padding: 24 },
  urlText: { fontSize: 13, fontFamily: "Poppins_500Medium", marginBottom: 20 },
  shareBtn: { width: "100%", borderRadius: 14, overflow: "hidden", marginBottom: 12 },
  shareBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  shareBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 15 },
  hint: { fontSize: 12, fontFamily: "Poppins_400Regular" },
});

// ─── Platform Share Button ────────────────────────────────────────────────────

function PlatformBtn({
  emoji,
  label,
  color,
  onPress,
}: {
  emoji: string;
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[platS.btn, { backgroundColor: color + "22", borderColor: color + "44" }]} onPress={onPress} activeOpacity={0.75}>
      <Text style={platS.emoji}>{emoji}</Text>
      <Text style={[platS.label, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const platS = StyleSheet.create({
  btn: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, gap: 6, minWidth: 72 },
  emoji: { fontSize: 26 },
  label: { fontSize: 12, fontFamily: "Poppins_600SemiBold" },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FindFriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const myId = session?.user?.id ?? "";
  const username = (session?.user as any)?.user_metadata?.username ?? session?.user?.email?.split("@")[0] ?? "user";

  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;
  const bottomPad = Platform.OS === "web" ? 84 : insets.bottom + 20;

  const profileUrl = `https://gundruk.app/@${username}`;
  const shareMsg = `Hey! Follow me on Gundruk 🔥\n${profileUrl}`;
  const referralCode = myId ? makeReferralCode(username, myId) : "—";
  const inviteMsg = `Hey! I'm using Gundruk, the new social app 🔥\nJoin me: https://gundruk.app/download\nUse my code: ${referralCode}\nWe both get 100 free coins! 🎁`;

  const [qrVisible, setQrVisible] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // ── Search ──────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SocialMatchUser[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    searchTimer.current = setTimeout(async () => {
      const results = await searchVibeUsers(searchQuery.trim(), myId);
      setSearchResults(results);
      setSearchLoading(false);
    }, 350);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [searchQuery, myId]);

  // ── Phone Contacts ──────────────────────────────────────────────────────────
  const [contactsStatus, setContactsStatus] = useState<"idle" | "loading" | "granted" | "denied">("idle");
  const [contactMatches, setContactMatches] = useState<SocialMatchUser[]>([]);
  const [contactsToInvite, setContactsToInvite] = useState<{ name: string; phone?: string }[]>([]);
  const [showAllInvites, setShowAllInvites] = useState(false);

  const requestContacts = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Contact access is only available on the Gundruk mobile app.");
      return;
    }
    setContactsStatus("loading");
    try {
      const Contacts = await import("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") { setContactsStatus("denied"); return; }
      setContactsStatus("granted");
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const emails = data.flatMap((c: any) => c.emails ?? []).map((e: any) => e.email).filter(Boolean) as string[];
      if (emails.length && myId) {
        const matched = await findUsersByEmails(emails, myId);
        setContactMatches(matched);
        const matchedEmails = new Set(matched.map((m) => m.username.toLowerCase()));
        const toInvite = data
          .filter((c: any) => {
            const cEmails = (c.emails ?? []).map((e: any) => e.email?.toLowerCase());
            return cEmails.every((e: string) => !matchedEmails.has(e)) && c.name;
          })
          .slice(0, 50)
          .map((c: any) => ({
            name: c.name,
            phone: c.phoneNumbers?.[0]?.number,
          }));
        setContactsToInvite(toInvite);
      }
    } catch {
      setContactsStatus("denied");
    }
  }, [myId]);

  // ── Suggested ───────────────────────────────────────────────────────────────
  const [suggested, setSuggested] = useState<SocialMatchUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);

  useEffect(() => {
    if (!myId) return;
    getSuggestedUsersForFindFriends(myId, 12)
      .then(setSuggested)
      .catch(() => {})
      .finally(() => setSuggestedLoading(false));
  }, [myId]);

  // ── Copy link ────────────────────────────────────────────────────────────────
  const handleCopyLink = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try { Clipboard.setString(profileUrl); } catch {}
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, [profileUrl]);

  // ── Native share ─────────────────────────────────────────────────────────────
  const handleNativeShare = useCallback(() => {
    Share.share({ message: shareMsg, title: `@${username} on Gundruk` }).catch(() => {});
  }, [shareMsg, username]);

  // ── Platform sharing ─────────────────────────────────────────────────────────
  const shareToWhatsApp = useCallback(() => {
    const waUrl = `whatsapp://send?text=${encodeURIComponent(shareMsg)}`;
    openUrl(waUrl).then((r) => {
      if (r === undefined) {
        Share.share({ message: shareMsg }).catch(() => {});
      }
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [shareMsg]);

  const shareToFacebook = useCallback(() => {
    openUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(profileUrl)}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [profileUrl]);

  const shareToTwitter = useCallback(() => {
    const tweet = `Follow me on Gundruk! 🔥 ${profileUrl}`;
    openUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [profileUrl]);

  const shareToInstagram = useCallback(() => {
    Share.share({ message: shareMsg }).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [shareMsg]);

  const shareToTikTok = useCallback(() => {
    Share.share({ message: shareMsg }).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [shareMsg]);

  const invitesToShow = showAllInvites ? contactsToInvite : contactsToInvite.slice(0, 5);

  return (
    <View style={[S.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient colors={["rgba(124,58,237,0.28)", "transparent"]} style={[S.header, { paddingTop: topPad }]}>
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>Find Friends</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      {/* Search bar */}
      <View style={[S.searchWrap, { borderBottomColor: colors.border }]}>
        <View style={[S.searchBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
          <Ionicons name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[S.searchInput, { color: colors.foreground }]}
            placeholder="Search by @username…"
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
              <Ionicons name="close-circle" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search results overlay */}
      {(searchQuery.length >= 2) && (
        <View style={[S.searchResults, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {searchLoading ? (
            <View style={S.searchLoadingWrap}>
              <ActivityIndicator color="#7C3AED" size="small" />
            </View>
          ) : searchResults.length === 0 ? (
            <Text style={[S.searchEmpty, { color: colors.mutedForeground }]}>No users found for "{searchQuery}"</Text>
          ) : (
            searchResults.map((u) => (
              <UserRow key={u.id} user={u} myId={myId} colors={colors} />
            ))
          )}
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Share Profile Link ─────────────────────────────────────── */}
        <View style={[S.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={["rgba(124,58,237,0.18)", "rgba(249,115,22,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={S.profileGrad}
          >
            <Text style={[S.profileLabel, { color: colors.mutedForeground }]}>YOUR PROFILE LINK</Text>
            <View style={S.profileUrlRow}>
              <Text style={[S.profileUrl, { color: colors.foreground }]} numberOfLines={1}>{profileUrl}</Text>
              <TouchableOpacity style={S.copyBtn} onPress={handleCopyLink}>
                <Ionicons name={urlCopied ? "checkmark" : "copy-outline"} size={16} color={urlCopied ? "#22C55E" : "#7C3AED"} />
                <Text style={[S.copyText, { color: urlCopied ? "#22C55E" : "#7C3AED" }]}>
                  {urlCopied ? "Copied!" : "Copy"}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Platform share grid */}
            <View style={S.platRow}>
              <PlatformBtn emoji="💬" label="WhatsApp" color="#25D366" onPress={shareToWhatsApp} />
              <PlatformBtn emoji="👥" label="Facebook" color="#1877F2" onPress={shareToFacebook} />
              <PlatformBtn emoji="🐦" label="Twitter/X" color="#1DA1F2" onPress={shareToTwitter} />
              <PlatformBtn emoji="📸" label="Instagram" color="#E1306C" onPress={shareToInstagram} />
            </View>

            <View style={S.shareActionsRow}>
              <TouchableOpacity style={S.shareNativeBtn} onPress={handleNativeShare}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.shareNativeGrad}>
                  <Ionicons name="share-social" size={16} color="#fff" />
                  <Text style={S.shareNativeText}>Share Profile</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                style={[S.qrBtn, { borderColor: "rgba(124,58,237,0.4)", backgroundColor: "rgba(124,58,237,0.12)" }]}
                onPress={() => setQrVisible(true)}
              >
                <Ionicons name="qr-code-outline" size={16} color="#A78BFA" />
                <Text style={S.qrBtnText}>My QR Code</Text>
              </TouchableOpacity>
            </View>

            <View style={S.tiktokRow}>
              <TouchableOpacity style={[S.tiktokShareBtn, { borderColor: "rgba(255,255,255,0.15)", backgroundColor: "rgba(255,255,255,0.06)" }]} onPress={shareToTikTok}>
                <Text style={{ fontSize: 16 }}>🎵</Text>
                <Text style={[S.tiktokShareText, { color: colors.foreground }]}>Share to TikTok</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── Referral Code ─────────────────────────────────────────── */}
        <View style={[S.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={["rgba(234,179,8,0.15)", "rgba(249,115,22,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={S.referralGrad}
          >
            <View style={S.referralRow}>
              <View style={{ flex: 1 }}>
                <Text style={[S.referralLabel, { color: colors.mutedForeground }]}>REFERRAL CODE</Text>
                <Text style={S.referralCode}>{referralCode}</Text>
                <Text style={[S.referralHint, { color: colors.mutedForeground }]}>
                  🎁 Both of you get +100 coins when friends join with your code
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  Share.share({
                    message: inviteMsg,
                    title: "Join me on Gundruk!",
                  }).catch(() => {});
                }}
              >
                <LinearGradient colors={["#EAB308", "#F97316"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.referralShareGrad}>
                  <Ionicons name="share-outline" size={14} color="#fff" />
                  <Text style={S.referralShareText}>Invite</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── Phone Contacts ────────────────────────────────────────── */}
        <SectionCard emoji="📱" title="From Your Contacts" subtitle="Find friends already on Gundruk" colors={colors}>
          {contactsStatus === "idle" && (
            <TouchableOpacity style={S.accessBtn} onPress={requestContacts}>
              <LinearGradient colors={["rgba(124,58,237,0.15)", "rgba(249,115,22,0.08)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.accessBtnInner}>
                <Ionicons name="people-outline" size={18} color="#7C3AED" />
                <Text style={[S.accessBtnText, { color: colors.foreground }]}>Allow Contact Access</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
              </LinearGradient>
            </TouchableOpacity>
          )}

          {contactsStatus === "loading" && (
            <View style={S.centeredPad}>
              <ActivityIndicator color="#7C3AED" />
              <Text style={[S.centeredText, { color: colors.mutedForeground }]}>Scanning contacts…</Text>
            </View>
          )}

          {contactsStatus === "denied" && (
            <View style={S.centeredPad}>
              <Text style={[S.centeredText, { color: colors.mutedForeground }]}>
                Contact access denied. Enable it in Settings to find friends.
              </Text>
            </View>
          )}

          {contactsStatus === "granted" && contactMatches.length > 0 && (
            <>
              <View style={S.matchBanner}>
                <Text style={S.matchBannerText}>
                  🎉 {contactMatches.length} friend{contactMatches.length !== 1 ? "s" : ""} already on Gundruk!
                </Text>
              </View>
              {contactMatches.map((u) => (
                <UserRow key={u.id} user={u} myId={myId} colors={colors} tag="From your contacts" />
              ))}
            </>
          )}

          {contactsStatus === "granted" && contactMatches.length === 0 && (
            <View style={S.centeredPad}>
              <Text style={{ fontSize: 22, marginBottom: 6 }}>🔍</Text>
              <Text style={[S.centeredText, { color: colors.mutedForeground }]}>
                None of your contacts are on Gundruk yet.
              </Text>
            </View>
          )}

          <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
            <Text style={[{ fontSize: 11, fontFamily: "Poppins_400Regular", color: colors.mutedForeground }]}>
              🔒 Your contacts are never stored on our servers.
            </Text>
          </View>
        </SectionCard>

        {/* ── Invite Friends (not on Vibe) ──────────────────────────── */}
        {contactsStatus === "granted" && contactsToInvite.length > 0 && (
          <SectionCard
            emoji="✉️"
            title="Invite Friends"
            subtitle={`${contactsToInvite.length} contacts not on Gundruk yet`}
            colors={colors}
          >
            {invitesToShow.map((c, i) => (
              <InviteRow key={i} name={c.name} phone={c.phone} referralCode={referralCode} colors={colors} />
            ))}
            {contactsToInvite.length > 5 && (
              <TouchableOpacity
                style={S.showMoreBtn}
                onPress={() => setShowAllInvites((v) => !v)}
              >
                <Text style={[S.showMoreText, { color: "#7C3AED" }]}>
                  {showAllInvites ? "Show less" : `Show all ${contactsToInvite.length} contacts`}
                </Text>
              </TouchableOpacity>
            )}
          </SectionCard>
        )}

        {/* ── Suggested ────────────────────────────────────────────── */}
        <SectionCard emoji="✨" title="Suggested for You" subtitle="People you might want to follow" colors={colors}>
          {suggestedLoading ? (
            <View style={S.centeredPad}>
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : suggested.length === 0 ? (
            <View style={S.centeredPad}>
              <Text style={[S.centeredText, { color: colors.mutedForeground }]}>No suggestions right now</Text>
            </View>
          ) : (
            suggested.map((u) => <UserRow key={u.id} user={u} myId={myId} colors={colors} />)
          )}
        </SectionCard>
      </ScrollView>

      {/* QR Code Modal */}
      <QRModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        profileUrl={profileUrl}
        username={username}
        colors={colors}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontFamily: "Poppins_700Bold" },

  searchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 0.5 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular", padding: 0 },
  searchResults: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 99, borderBottomWidth: 0.5, maxHeight: 320 },
  searchLoadingWrap: { padding: 20, alignItems: "center" },
  searchEmpty: { padding: 16, textAlign: "center", fontSize: 13, fontFamily: "Poppins_400Regular" },

  profileCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  profileGrad: { padding: 16 },
  profileLabel: { fontSize: 11, fontFamily: "Poppins_700Bold", letterSpacing: 0.8, marginBottom: 8 },
  profileUrlRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  profileUrl: { flex: 1, fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 4 },
  copyText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  platRow: { flexDirection: "row", gap: 8, marginBottom: 12 },

  shareActionsRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  shareNativeBtn: { flex: 2, borderRadius: 12, overflow: "hidden" },
  shareNativeGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11 },
  shareNativeText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  qrBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 11 },
  qrBtnText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 },

  tiktokRow: {},
  tiktokShareBtn: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 0.5 },
  tiktokShareText: { flex: 1, fontSize: 14, fontFamily: "Poppins_600SemiBold" },

  referralCard: { marginHorizontal: 16, marginBottom: 12, borderRadius: 16, borderWidth: 0.5, overflow: "hidden" },
  referralGrad: { padding: 16 },
  referralLabel: { fontSize: 11, fontFamily: "Poppins_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  referralCode: { fontSize: 24, fontFamily: "Poppins_700Bold", color: "#EAB308", letterSpacing: 3, marginBottom: 6 },
  referralHint: { fontSize: 12, fontFamily: "Poppins_400Regular", lineHeight: 17 },
  referralRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  referralShareGrad: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  referralShareText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },

  accessBtn: { marginHorizontal: 16, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  accessBtnInner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  accessBtnText: { flex: 1, fontSize: 14, fontFamily: "Poppins_600SemiBold" },

  matchBanner: { marginHorizontal: 16, marginBottom: 8, backgroundColor: "rgba(34,197,94,0.12)", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  matchBannerText: { fontSize: 13, fontFamily: "Poppins_700Bold", color: "#22C55E" },

  centeredPad: { padding: 20, alignItems: "center", gap: 8 },
  centeredText: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center" },

  showMoreBtn: { paddingVertical: 12, alignItems: "center" },
  showMoreText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
});
