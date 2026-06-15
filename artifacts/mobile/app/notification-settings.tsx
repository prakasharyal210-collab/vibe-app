import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { fetchUserSettings, saveUserSettings, UserSettings } from "@/lib/db";

// ─── Local toast hook ─────────────────────────────────────────────────────────
function useToast() {
  const [msg, setMsg] = useState("");
  const opacity = useRef(new Animated.Value(0)).current;
  const show = (m: string) => {
    setMsg(m);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
  };
  const ToastView = () => (
    <Animated.View style={[ts.toast, { opacity }]} pointerEvents="none">
      <Text style={ts.toastText}>{msg}</Text>
    </Animated.View>
  );
  return { show, ToastView };
}
const ts = StyleSheet.create({
  toast: {
    position: "absolute", bottom: 90, alignSelf: "center",
    backgroundColor: "rgba(30,30,40,0.92)", paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 20, zIndex: 999,
  },
  toastText: { color: "#fff", fontFamily: "Poppins_500Medium", fontSize: 13 },
});

// ─── Module-scope sub-components ─────────────────────────────────────────────
// Defined outside the screen so React sees a stable type on every render —
// this prevents Ionicons from remounting and rendering empty glyphs.

function NCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[ns.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

type NRowProps = {
  icon: string;
  iconBg: string;
  label: string;
  sub?: string;
  isLast?: boolean;
  rightEl?: React.ReactNode;
  onPress?: () => void;
  faded?: boolean;
};

function NRow({ icon, iconBg, label, sub, isLast = false, rightEl, onPress, faded }: NRowProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && !rightEl}
      activeOpacity={0.8}
      style={[
        ns.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        faded && { opacity: 0.4 },
      ]}
    >
      <View style={[ns.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      <View style={ns.rowText}>
        <Text style={[ns.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[ns.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {rightEl ?? null}
    </TouchableOpacity>
  );
}

function NSec({ label }: { label: string }) {
  const colors = useColors();
  return <Text style={[ns.secLabel, { color: colors.mutedForeground }]}>{label}</Text>;
}

// ─── NotificationSettingsScreen ───────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { show: toast, ToastView } = useToast();
  const userId = session?.user?.id ?? "";
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Push master ───────────────────────────────────────────────────────────
  const [pushEnabled,     setPushEnabled]     = useState(true);
  const [inApp,           setInApp]           = useState(true);

  // ── Interactions ─────────────────────────────────────────────────────────
  const [likes,           setLikes]           = useState(true);
  const [comments,        setComments]        = useState(true);
  const [follows,         setFollows]         = useState(true);
  const [reposts,         setReposts]         = useState(true);
  const [tags,            setTags]            = useState(true);
  const [commentLikes,    setCommentLikes]    = useState(true);

  // ── Messages ─────────────────────────────────────────────────────────────
  const [dm,              setDm]              = useState(true);
  const [dmPreviews,      setDmPreviews]      = useState(true);
  const [dmRequests,      setDmRequests]      = useState(true);
  const [activityStatus,  setActivityStatus]  = useState(true);

  // ── Find Vibe ────────────────────────────────────────────────────────────
  const [vibeMatch,       setVibeMatch]       = useState(true);
  const [vibeRequest,     setVibeRequest]     = useState(true);

  // ── Post Suggestions ─────────────────────────────────────────────────────
  const [postFollowing,   setPostFollowing]   = useState(true);
  const [postRecommended, setPostRecommended] = useState(true);

  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId).then((s) => {
      setPushEnabled(s.notif_push_enabled);
      setInApp(s.notif_in_app);
      setLikes(s.notif_likes);
      setComments(s.notif_comments);
      setFollows(s.notif_follows);
      setReposts(s.notif_reposts);
      setTags(s.notif_tags);
      setCommentLikes(s.notif_comment_likes);
      setDm(s.notif_dm);
      setDmPreviews(s.notif_dm_previews);
      setDmRequests(s.notif_dm_requests);
      setActivityStatus(s.notif_activity_status);
      setVibeMatch(s.notif_vibe_match);
      setVibeRequest(s.notif_vibe_request);
      setPostFollowing(s.notif_post_following);
      setPostRecommended(s.notif_post_recommended);
    }).catch(() => {});
  }, [userId]);

  const persist = (patch: Partial<UserSettings>) => {
    if (!userId) return;
    saveUserSettings(userId, patch);
  };

  // Returns a Switch element gated (or not) by the push master
  const sw = (
    val: boolean,
    set: (v: boolean) => void,
    key: keyof UserSettings,
    gated = true,
    accentColor = "#7C3AED",
  ) => (
    <Switch
      value={gated ? val && pushEnabled : val}
      onValueChange={(v) => { set(v); persist({ [key]: v } as Partial<UserSettings>); }}
      trackColor={{ false: "#3F3F46", true: accentColor }}
      thumbColor="#fff"
      style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
    />
  );

  const p = pushEnabled;

  return (
    <View style={[ns.container, { backgroundColor: colors.background }]}>

      {/* ── Header ── */}
      <View style={[ns.header, { paddingTop: topInset + 6, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[ns.title, { color: colors.foreground }]}>Notification Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 52 }} showsVerticalScrollIndicator={false}>

        {/* ════════════════════════════════════════════════════
            PUSH NOTIFICATIONS
        ════════════════════════════════════════════════════ */}
        <View style={ns.section}>
          <NSec label="Push Notifications" />
          <NCard>
            <NRow
              icon="notifications-outline" iconBg="#8B5CF6"
              label="Push Notifications"
              sub={p ? "All push notifications enabled" : "All push notifications off — nothing will be sent"}
              rightEl={
                <Switch
                  value={p}
                  onValueChange={(v) => {
                    setPushEnabled(v);
                    persist({ notif_push_enabled: v });
                    toast(v ? "Push notifications on ✅" : "Push notifications off");
                  }}
                  trackColor={{ false: "#3F3F46", true: "#7C3AED" }}
                  thumbColor="#fff"
                  style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
                />
              }
            />
            <NRow
              icon="phone-portrait-outline" iconBg="#6D28D9"
              label="In-App Notifications"
              sub="Banners and sounds while using the app"
              isLast
              rightEl={sw(inApp, setInApp, "notif_in_app", false)}
            />
          </NCard>
        </View>

        {/* ════════════════════════════════════════════════════
            INTERACTIONS
        ════════════════════════════════════════════════════ */}
        <View style={ns.section}>
          <NSec label="Interactions" />
          <NCard>
            <NRow
              icon="heart-outline" iconBg="#EC4899"
              label="Likes"
              sub="When someone likes your post or reel"
              faded={!p}
              rightEl={sw(likes, setLikes, "notif_likes", true, "#EC4899")}
            />
            <NRow
              icon="chatbubble-outline" iconBg="#7C3AED"
              label="Comments"
              sub="When someone comments on your content"
              faded={!p}
              rightEl={sw(comments, setComments, "notif_comments")}
            />
            <NRow
              icon="person-add-outline" iconBg="#0EA5E9"
              label="New Followers"
              sub="When someone follows you"
              faded={!p}
              rightEl={sw(follows, setFollows, "notif_follows", true, "#0EA5E9")}
            />
            <NRow
              icon="repeat-outline" iconBg="#10B981"
              label="Reposts & Shares"
              sub="When someone shares your content"
              faded={!p}
              rightEl={sw(reposts, setReposts, "notif_reposts", true, "#10B981")}
            />
            <NRow
              icon="at-outline" iconBg="#F97316"
              label="Tags & Mentions"
              sub="When someone tags or mentions you in a post"
              faded={!p}
              rightEl={sw(tags, setTags, "notif_tags", true, "#F97316")}
            />
            <NRow
              icon="thumbs-up-outline" iconBg="#F59E0B"
              label="Comment Likes & Replies"
              sub="When someone likes or replies to your comment"
              faded={!p}
              isLast
              rightEl={sw(commentLikes, setCommentLikes, "notif_comment_likes", true, "#F59E0B")}
            />
          </NCard>
        </View>

        {/* ════════════════════════════════════════════════════
            MESSAGES
        ════════════════════════════════════════════════════ */}
        <View style={ns.section}>
          <NSec label="Messages" />
          <NCard>
            <NRow
              icon="chatbubbles-outline" iconBg="#8B5CF6"
              label="Direct Messages"
              sub="When you receive a new message"
              faded={!p}
              rightEl={sw(dm, setDm, "notif_dm")}
            />
            <NRow
              icon="eye-outline" iconBg="#6D28D9"
              label="Message Previews"
              sub={dmPreviews ? "Shows message content in notification" : "Shows 'New message' only"}
              rightEl={sw(dmPreviews, setDmPreviews, "notif_dm_previews", false)}
            />
            <NRow
              icon="mail-outline" iconBg="#5B21B6"
              label="Message Requests"
              sub="When someone new wants to message you"
              faded={!p}
              rightEl={sw(dmRequests, setDmRequests, "notif_dm_requests")}
            />
            <NRow
              icon="radio-button-on-outline" iconBg="#4C1D95"
              label="Activity Status"
              sub={activityStatus ? "Others can see when you're active" : "Your active status is hidden"}
              isLast
              rightEl={sw(activityStatus, setActivityStatus, "notif_activity_status", false)}
            />
          </NCard>
        </View>

        {/* ════════════════════════════════════════════════════
            FIND VIBE
        ════════════════════════════════════════════════════ */}
        <View style={ns.section}>
          <NSec label="Find Vibe" />
          <NCard>
            <NRow
              icon="heart-circle-outline" iconBg="#EC4899"
              label="Vibe Matches"
              sub="When you get a mutual match 💜"
              faded={!p}
              rightEl={sw(vibeMatch, setVibeMatch, "notif_vibe_match", true, "#EC4899")}
            />
            <NRow
              icon="flash-outline" iconBg="#F59E0B"
              label="Vibe Requests"
              sub="When someone sends you a Vibe"
              faded={!p}
              isLast
              rightEl={sw(vibeRequest, setVibeRequest, "notif_vibe_request", true, "#F59E0B")}
            />
          </NCard>
        </View>

        {/* ════════════════════════════════════════════════════
            POST SUGGESTIONS
        ════════════════════════════════════════════════════ */}
        <View style={ns.section}>
          <NSec label="Post Suggestions" />
          <NCard>
            <NRow
              icon="people-outline" iconBg="#059669"
              label="From accounts you follow"
              sub="New posts from people you follow"
              rightEl={sw(postFollowing, setPostFollowing, "notif_post_following", false, "#059669")}
            />
            <NRow
              icon="star-outline" iconBg="#7C3AED"
              label="Recommended for you"
              sub="Personalized based on your interests & activity"
              isLast
              rightEl={sw(postRecommended, setPostRecommended, "notif_post_recommended", false)}
            />
          </NCard>
        </View>

      </ScrollView>

      <ToastView />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ns = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Poppins_700Bold" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  secLabel: {
    fontSize: 13, fontFamily: "Poppins_600SemiBold",
    marginBottom: 8, paddingLeft: 2,
  },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 13, gap: 13,
  },
  iconBox: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 1 },
});
