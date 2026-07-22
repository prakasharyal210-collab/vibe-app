import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  Platform,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "") + "/api";

export default function InviteFriendsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const userId = session?.user?.id;
  const inviteLink = referralCode
    ? `https://gundrukapp.com/r/${referralCode}`
    : null;

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/referral/my-code?userId=${encodeURIComponent(userId)}`);
        if (res.ok) {
          const body = await res.json();
          setReferralCode(body.referralCode ?? null);
        }
      } catch {}
      finally { setLoading(false); }
    })();
  }, [userId]);

  const handleCopy = () => {
    if (!inviteLink) return;
    Clipboard.setString(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (!inviteLink) return;
    try {
      await Share.share({
        message: `Join me on Gundruk! 🎉 Download the app and sign up with my referral link:\n${inviteLink}`,
        url: inviteLink,
        title: "Join Gundruk",
      });
    } catch {}
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[S.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[S.headerTitle, { color: colors.foreground }]}>Invite Friends</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={S.body}>
        {/* Hero card */}
        <LinearGradient
          colors={["rgba(124,58,237,0.18)", "rgba(249,115,22,0.10)"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[S.heroCard, { borderColor: "rgba(124,58,237,0.25)" }]}
        >
          <Text style={S.heroEmoji}>🎁</Text>
          <Text style={[S.heroTitle, { color: colors.foreground }]}>Earn 50 coins per friend</Text>
          <Text style={[S.heroSub, { color: colors.mutedForeground }]}>
            Share your link. When a friend signs up and creates their first post, you earn{" "}
            <Text style={{ color: "#7C3AED", fontFamily: "Poppins_700Bold" }}>50 coins</Text>.
          </Text>
        </LinearGradient>

        {/* Code + link block */}
        <View style={[S.codeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[S.codeLabel, { color: colors.mutedForeground }]}>Your referral code</Text>
          {loading ? (
            <ActivityIndicator color="#7C3AED" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={[S.code, { color: colors.foreground }]}>
              {referralCode ?? "—"}
            </Text>
          )}

          {inviteLink && (
            <Text style={[S.link, { color: colors.mutedForeground }]} numberOfLines={1}>
              {inviteLink}
            </Text>
          )}

          <View style={S.btnRow}>
            <TouchableOpacity
              style={[S.copyBtn, { backgroundColor: colors.muted, borderColor: colors.border, opacity: inviteLink ? 1 : 0.4 }]}
              onPress={handleCopy}
              disabled={!inviteLink}
            >
              <Ionicons name={copied ? "checkmark" : "copy-outline"} size={18} color={copied ? "#22C55E" : colors.foreground} />
              <Text style={[S.copyText, { color: copied ? "#22C55E" : colors.foreground }]}>
                {copied ? "Copied!" : "Copy link"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleShare}
              disabled={!inviteLink}
              style={{ flex: 1, borderRadius: 12, overflow: "hidden", opacity: inviteLink ? 1 : 0.4 }}
            >
              <LinearGradient
                colors={["#7C3AED", "#EA580C"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={S.shareBtn}
              >
                <Ionicons name="share-outline" size={18} color="#fff" />
                <Text style={S.shareText}>Share</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>

        {/* How it works */}
        <View style={[S.howCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[S.howTitle, { color: colors.foreground }]}>How it works</Text>
          {[
            { n: "1", text: "Share your unique link or code with a friend." },
            { n: "2", text: "They sign up using your link and create their first post." },
            { n: "3", text: "You earn 50 coins — automatically added to your wallet." },
          ].map((step) => (
            <View key={step.n} style={S.step}>
              <View style={S.stepNum}>
                <Text style={S.stepNumText}>{step.n}</Text>
              </View>
              <Text style={[S.stepText, { color: colors.mutedForeground }]}>{step.text}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingBottom: 12,
    borderBottomWidth: 0.5, gap: 10,
  },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: "Poppins_700Bold", textAlign: "center" },
  body: { flex: 1, padding: 20, gap: 18 },
  heroCard: { borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 10 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { fontSize: 18, fontFamily: "Poppins_700Bold", textAlign: "center" },
  heroSub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  codeCard: {
    borderRadius: 16, borderWidth: 1, padding: 18, gap: 8,
  },
  codeLabel: { fontSize: 12, fontFamily: "Poppins_500Medium", textTransform: "uppercase", letterSpacing: 0.8 },
  code: { fontSize: 28, fontFamily: "Poppins_700Bold", letterSpacing: 4 },
  link: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  copyBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, borderRadius: 12, paddingVertical: 12, borderWidth: 1,
  },
  copyText: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  shareBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 12,
  },
  shareText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  howCard: { borderRadius: 16, borderWidth: 1, padding: 18, gap: 14 },
  howTitle: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  step: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center",
  },
  stepNumText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold" },
  stepText: { flex: 1, fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 21 },
});
