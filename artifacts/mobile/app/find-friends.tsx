import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  findUsersByEmails,
  findUsersBySocialUsername,
  getSuggestedUsersForFindFriends,
  saveSocialConnection,
  SocialMatchUser,
  toggleFollowUser,
} from "@/lib/db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Shared User Row ─────────────────────────────────────────────────────────

function UserRow({
  user,
  myId,
  onFollowed,
  colors,
  tag,
}: {
  user: SocialMatchUser;
  myId: string;
  onFollowed?: (id: string, nowFollowing: boolean) => void;
  colors: any;
  tag?: string;
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
      style={[rowStyles.wrap, { borderBottomColor: colors.border }]}
      activeOpacity={0.7}
      onPress={() => router.push(`/profile/${user.username}` as any)}
    >
      <UserAvatar username={user.username} url={user.avatar_url} size={48} />
      <View style={rowStyles.info}>
        <View style={rowStyles.nameRow}>
          <Text style={[rowStyles.username, { color: colors.foreground }]} numberOfLines={1}>
            @{user.username}
          </Text>
          {user.is_verified && (
            <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
          )}
        </View>
        {user.bio ? (
          <Text style={[rowStyles.bio, { color: colors.mutedForeground }]} numberOfLines={1}>
            {user.bio}
          </Text>
        ) : null}
        {user.followers_count ? (
          <Text style={[rowStyles.followers, { color: colors.mutedForeground }]}>
            {fmtCount(user.followers_count)} followers
          </Text>
        ) : null}
        {tag ? (
          <Text style={rowStyles.tag}>{tag}</Text>
        ) : null}
      </View>
      <TouchableOpacity
        style={[
          rowStyles.btn,
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
          <Text style={[rowStyles.btnText, { color: following ? colors.foreground : "#fff" }]}>
            {following ? "Following" : "Follow"}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  username: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  bio: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  followers: { fontSize: 11, fontFamily: "Poppins_400Regular" },
  tag: { fontSize: 11, fontFamily: "Poppins_500Medium", color: "#F97316" },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 9,
    minWidth: 80,
    alignItems: "center",
  },
  btnText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
});

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  emoji,
  title,
  subtitle,
  colors,
  children,
}: {
  emoji: string;
  title: string;
  subtitle?: string;
  colors: any;
  children: React.ReactNode;
}) {
  return (
    <View style={[cardStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={cardStyles.header}>
        <Text style={cardStyles.emoji}>{emoji}</Text>
        <View style={cardStyles.headerText}>
          <Text style={[cardStyles.title, { color: colors.foreground }]}>{title}</Text>
          {subtitle ? (
            <Text style={[cardStyles.sub, { color: colors.mutedForeground }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  emoji: { fontSize: 22 },
  headerText: { flex: 1, gap: 1 },
  title: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  sub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
});

// ─── Social Input Section ─────────────────────────────────────────────────────

function SocialSection({
  emoji,
  title,
  subtitle,
  placeholder,
  platform,
  myId,
  colors,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  placeholder: string;
  platform: "facebook" | "tiktok" | "instagram";
  myId: string;
  colors: any;
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [results, setResults] = useState<SocialMatchUser[]>([]);
  const [searched, setSearched] = useState(false);

  const handleFind = async () => {
    if (!input.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setLoading(true);
    setSearched(true);
    await saveSocialConnection(myId, platform, input.trim());
    setSaved(true);
    const found = await findUsersBySocialUsername(platform, input.trim(), myId);
    setResults(found);
    setLoading(false);
  };

  return (
    <SectionCard emoji={emoji} title={title} subtitle={subtitle} colors={colors}>
      <View style={socialStyles.inputRow}>
        <TextInput
          style={[socialStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={handleFind}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TouchableOpacity
          style={[socialStyles.findBtn, { opacity: input.trim() ? 1 : 0.4 }]}
          onPress={handleFind}
          disabled={!input.trim() || loading}
        >
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={socialStyles.findBtnGrad}>
            <Text style={socialStyles.findBtnText}>Find</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {saved && !loading && (
        <View style={[socialStyles.savedBanner, { backgroundColor: "rgba(124,58,237,0.12)" }]}>
          <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
          <Text style={[socialStyles.savedText, { color: "#7C3AED" }]}>
            Saved! Others with the same {platform} username can find you.
          </Text>
        </View>
      )}

      {loading && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <ActivityIndicator color="#7C3AED" />
        </View>
      )}

      {!loading && searched && results.length === 0 && (
        <View style={socialStyles.emptyResult}>
          <Text style={[socialStyles.emptyText, { color: colors.mutedForeground }]}>
            No Vibe users found with that {platform} username yet.
          </Text>
          <Text style={[{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center", marginTop: 4 }]}>
            Your connection was saved — friends who connect the same username will appear here.
          </Text>
        </View>
      )}

      {results.map((u) => (
        <UserRow
          key={u.id}
          user={u}
          myId={myId}
          colors={colors}
          tag={u.matchedName ? `${platform}: @${u.matchedName}` : undefined}
        />
      ))}
    </SectionCard>
  );
}

const socialStyles = StyleSheet.create({
  inputRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  input: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  findBtn: { borderRadius: 10, overflow: "hidden" },
  findBtnGrad: { paddingHorizontal: 16, paddingVertical: 9, alignItems: "center", justifyContent: "center" },
  findBtnText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  savedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  savedText: { fontSize: 12, fontFamily: "Poppins_500Medium", flex: 1 },
  emptyResult: { paddingHorizontal: 16, paddingBottom: 14, alignItems: "center" },
  emptyText: { fontSize: 13, fontFamily: "Poppins_500Medium", textAlign: "center" },
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

  const referralCode = myId ? makeReferralCode(username, myId) : "—";

  const [contactsStatus, setContactsStatus] = useState<"idle" | "loading" | "granted" | "denied">("idle");
  const [contactMatches, setContactMatches] = useState<SocialMatchUser[]>([]);
  const [suggested, setSuggested] = useState<SocialMatchUser[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!myId) return;
    getSuggestedUsersForFindFriends(myId, 12).then(setSuggested).catch(() => {}).finally(() => setSuggestedLoading(false));
  }, [myId]);

  const requestContacts = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert("Not available", "Contact access is only available on the Vibe mobile app.");
      return;
    }
    setContactsStatus("loading");
    try {
      const Contacts = await import("expo-contacts");
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setContactsStatus("denied");
        return;
      }
      setContactsStatus("granted");
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });
      const emails = data
        .flatMap((c: any) => c.emails ?? [])
        .map((e: any) => e.email)
        .filter(Boolean) as string[];
      if (emails.length && myId) {
        const matched = await findUsersByEmails(emails, myId);
        setContactMatches(matched);
      }
    } catch {
      setContactsStatus("denied");
    }
  }, [myId]);

  const handleCopyCode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (Platform.OS === "web") {
      try { (navigator as any).clipboard?.writeText(referralCode).catch(() => {}); } catch {}
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [referralCode]);

  const handleShareCode = useCallback(() => {
    Share.share({
      message: `Hey! 👋 Join me on Vibe — the best social app around! 🔥\nDownload it and use my referral code: ${referralCode}\nhttps://vibe.app/download`,
      title: "Join me on Vibe!",
    }).catch(() => {});
  }, [referralCode]);

  return (
    <View style={[S.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={["rgba(124,58,237,0.28)", "transparent"]}
        style={[S.header, { paddingTop: topPad }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={S.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>Find Friends</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: bottomPad }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Referral Code ─────────────────────────────────────────── */}
        <View style={[S.referralCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <LinearGradient
            colors={["rgba(124,58,237,0.15)", "rgba(249,115,22,0.08)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={S.referralGrad}
          >
            <Text style={[S.referralLabel, { color: colors.mutedForeground }]}>Your referral code</Text>
            <View style={S.referralRow}>
              <Text style={S.referralCode}>{referralCode}</Text>
              <TouchableOpacity style={S.referralCopyBtn} onPress={handleCopyCode}>
                <Ionicons name={copied ? "checkmark" : "copy-outline"} size={16} color={copied ? "#22C55E" : "#7C3AED"} />
                <Text style={[S.referralCopyText, { color: copied ? "#22C55E" : "#7C3AED" }]}>
                  {copied ? "Copied!" : "Copy"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={S.referralShareBtn} onPress={handleShareCode}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={S.referralShareGrad}>
                  <Ionicons name="share-outline" size={14} color="#fff" />
                  <Text style={S.referralShareText}>Invite</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
            <Text style={[S.referralHint, { color: colors.mutedForeground }]}>
              🎁 Both you and your friend get +100 coins when they join with your code
            </Text>
          </LinearGradient>
        </View>

        {/* ── Phone Contacts ────────────────────────────────────────── */}
        <SectionCard
          emoji="📱"
          title="From Your Contacts"
          subtitle="Find friends who are already on Vibe"
          colors={colors}
        >
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
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator color="#7C3AED" />
              <Text style={[{ marginTop: 8, fontSize: 13, fontFamily: "Poppins_400Regular", color: colors.mutedForeground }]}>
                Scanning contacts…
              </Text>
            </View>
          )}

          {contactsStatus === "denied" && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
              <Text style={[{ fontSize: 13, fontFamily: "Poppins_400Regular", color: colors.mutedForeground, textAlign: "center" }]}>
                Contact access denied. Enable it in Settings to find friends.
              </Text>
            </View>
          )}

          {contactsStatus === "granted" && contactMatches.length === 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 14, alignItems: "center" }}>
              <Text style={{ fontSize: 22, marginBottom: 6 }}>🔍</Text>
              <Text style={[{ fontSize: 13, fontFamily: "Poppins_500Medium", color: colors.mutedForeground, textAlign: "center" }]}>
                None of your contacts are on Vibe yet.
              </Text>
              <TouchableOpacity style={{ marginTop: 10 }} onPress={handleShareCode}>
                <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingHorizontal: 20, paddingVertical: 9, borderRadius: 10 }}>
                  <Text style={{ color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 }}>Invite Contacts to Vibe</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          )}

          {contactsStatus === "granted" && contactMatches.length > 0 && (
            <>
              <View style={{ paddingHorizontal: 16, paddingBottom: 6, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={[{ fontSize: 13, fontFamily: "Poppins_500Medium", color: "#7C3AED" }]}>
                  {contactMatches.length} friend{contactMatches.length !== 1 ? "s" : ""} on Vibe
                </Text>
              </View>
              {contactMatches.map((u) => (
                <UserRow key={u.id} user={u} myId={myId} colors={colors} tag="From your contacts" />
              ))}
            </>
          )}

          <View style={{ paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 }}>
            <Text style={[{ fontSize: 11, fontFamily: "Poppins_400Regular", color: colors.mutedForeground }]}>
              🔒 Your contacts are never stored on our servers. Used only to find matches.
            </Text>
          </View>
        </SectionCard>

        {/* ── Facebook ─────────────────────────────────────────────── */}
        <SocialSection
          emoji="👥"
          title="Facebook"
          subtitle="Enter your Facebook username to find friends"
          placeholder="Your Facebook username"
          platform="facebook"
          myId={myId}
          colors={colors}
        />

        {/* ── TikTok ───────────────────────────────────────────────── */}
        <SocialSection
          emoji="🎵"
          title="TikTok"
          subtitle="Enter your @TikTok username to find friends"
          placeholder="@yourtiktok"
          platform="tiktok"
          myId={myId}
          colors={colors}
        />

        {/* ── Instagram ────────────────────────────────────────────── */}
        <SocialSection
          emoji="📸"
          title="Instagram"
          subtitle="Enter your Instagram username to find friends"
          placeholder="@yourinstagram"
          platform="instagram"
          myId={myId}
          colors={colors}
        />

        {/* ── Suggested ────────────────────────────────────────────── */}
        <SectionCard
          emoji="✨"
          title="Suggested for You"
          subtitle="People you might want to follow"
          colors={colors}
        >
          {suggestedLoading ? (
            <View style={{ padding: 20, alignItems: "center" }}>
              <ActivityIndicator color="#7C3AED" />
            </View>
          ) : suggested.length === 0 ? (
            <View style={{ padding: 16, alignItems: "center" }}>
              <Text style={[{ fontSize: 13, fontFamily: "Poppins_400Regular", color: colors.mutedForeground }]}>
                No suggestions right now
              </Text>
            </View>
          ) : (
            suggested.map((u) => (
              <UserRow key={u.id} user={u} myId={myId} colors={colors} />
            ))
          )}
        </SectionCard>
      </ScrollView>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  referralCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: "hidden",
  },
  referralGrad: { padding: 16 },
  referralLabel: { fontSize: 11, fontFamily: "Poppins_500Medium", marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" },
  referralRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  referralCode: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    color: "#7C3AED",
    letterSpacing: 3,
    flex: 1,
  },
  referralCopyBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  referralCopyText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  referralShareBtn: { borderRadius: 9, overflow: "hidden" },
  referralShareGrad: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7 },
  referralShareText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 13 },
  referralHint: { fontSize: 12, fontFamily: "Poppins_400Regular", lineHeight: 18 },

  accessBtn: { marginHorizontal: 16, marginBottom: 14, borderRadius: 12, overflow: "hidden" },
  accessBtnInner: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  accessBtnText: { flex: 1, fontSize: 14, fontFamily: "Poppins_600SemiBold" },
});
