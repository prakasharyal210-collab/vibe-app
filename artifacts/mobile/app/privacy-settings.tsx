import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
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
import {
  fetchUserSettings,
  getGundrukProfile,
  saveGundrukProfile,
  saveUserSettings,
  UserSettings,
} from "@/lib/db";

// ─── Local toast ──────────────────────────────────────────────────────────────
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

// ─── OptionPicker ─────────────────────────────────────────────────────────────
function OptionPicker({
  visible, title, options, selected, onSelect, onClose,
}: {
  visible: boolean; title: string;
  options: { label: string; value: string; icon?: string }[];
  selected: string; onSelect: (v: string) => void; onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={op.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[op.sheet, { backgroundColor: colors.background }]}>
        <View style={[op.handle, { backgroundColor: colors.border }]} />
        <Text style={[op.title, { color: colors.foreground }]}>{title}</Text>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => { onSelect(opt.value); onClose(); }}
            style={[op.optionRow, { borderBottomColor: colors.border }]}
          >
            {opt.icon ? (
              <Ionicons
                name={opt.icon as any}
                size={20}
                color={selected === opt.value ? "#7C3AED" : colors.mutedForeground}
              />
            ) : null}
            <Text style={[op.optionLabel, { color: selected === opt.value ? "#7C3AED" : colors.foreground }]}>
              {opt.label}
            </Text>
            {selected === opt.value ? <Ionicons name="checkmark" size={20} color="#7C3AED" /> : null}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onClose} style={[op.cancelBtn, { backgroundColor: colors.muted }]}>
          <Text style={[op.cancelText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}
const op = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, borderBottomWidth: 0.5 },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
  cancelBtn: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});

// ─── Module-scope sub-components ─────────────────────────────────────────────
// Defined OUTSIDE the screen so React sees a stable type on every render —
// prevents Ionicons from remounting and rendering empty glyphs.

function PSec({ label }: { label: string }) {
  const colors = useColors();
  return <Text style={[ps.secLabel, { color: colors.mutedForeground }]}>{label}</Text>;
}

function PCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[ps.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

type PRowProps = {
  icon: string;
  iconBg: string;
  label: string;
  sub?: string;
  isLast?: boolean;
  rightEl?: React.ReactNode;
  onPress?: () => void;
  faded?: boolean;
};

function PRow({ icon, iconBg, label, sub, isLast = false, rightEl, onPress, faded }: PRowProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && !rightEl}
      activeOpacity={0.8}
      style={[
        ps.row,
        !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        faded && { opacity: 0.4 },
      ]}
    >
      <View style={[ps.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      <View style={ps.rowText}>
        <Text style={[ps.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[ps.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {rightEl ?? null}
    </TouchableOpacity>
  );
}

// ─── Option arrays ────────────────────────────────────────────────────────────

const POST_VIEW_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Followers Only", value: "followers", icon: "people-outline" },
];

const COMMENT_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Your Followers", value: "followers", icon: "people-outline" },
  { label: "People You Follow", value: "following", icon: "person-add-outline" },
  { label: "No One", value: "nobody", icon: "ban-outline" },
];

const MENTION_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Your Followers", value: "followers", icon: "people-outline" },
  { label: "No One", value: "nobody", icon: "ban-outline" },
];

const MESSAGE_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Followers Only", value: "followers", icon: "people-outline" },
  { label: "No One", value: "nobody", icon: "ban-outline" },
];

const VIBE_REQUEST_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "People I Follow", value: "following", icon: "person-add-outline" },
  { label: "No One", value: "nobody", icon: "ban-outline" },
];

const STORY_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Friends Only", value: "friends", icon: "people-outline" },
];

const STORY_REPLY_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "globe-outline" },
  { label: "Friends", value: "friends", icon: "people-outline" },
  { label: "Off", value: "off", icon: "ban-outline" },
];

// ─── PrivacySettingsScreen ────────────────────────────────────────────────────

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { show: toast, ToastView } = useToast();
  const userId = session?.user?.id ?? "";
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Account Privacy ──────────────────────────────────────────────────────────
  const [privateAccount, setPrivateAccount]             = useState(false);
  const [postViewPermission, setPostViewPermission]     = useState("everyone");

  // ── Interactions ─────────────────────────────────────────────────────────────
  const [commentPermission, setCommentPermission]       = useState("everyone");
  const [mentionPermission, setMentionPermission]       = useState("everyone");
  const [messagePermission, setMessagePermission]       = useState("everyone");

  // ── Find Vibe ────────────────────────────────────────────────────────────────
  const [showInMatching, setShowInMatching]             = useState(true);
  const [vibeRequestPrivacy, setVibeRequestPrivacy]     = useState("everyone");

  // ── Activity & Visibility ────────────────────────────────────────────────────
  const [activityVisibility, setActivityVisibility]     = useState(true);

  // ── Story Controls ───────────────────────────────────────────────────────────
  const [storyPermission, setStoryPermission]           = useState("everyone");
  const [storyReplyPermission, setStoryReplyPermission] = useState("everyone");

  // ── Picker visibility ────────────────────────────────────────────────────────
  const [showPostViewPicker,    setShowPostViewPicker]    = useState(false);
  const [showCommentPicker,     setShowCommentPicker]     = useState(false);
  const [showMentionPicker,     setShowMentionPicker]     = useState(false);
  const [showMessagePicker,     setShowMessagePicker]     = useState(false);
  const [showVibePrivacyPicker, setShowVibePrivacyPicker] = useState(false);
  const [showStoryPicker,       setShowStoryPicker]       = useState(false);
  const [showStoryReplyPicker,  setShowStoryReplyPicker]  = useState(false);

  // ── Load settings ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId).then((s) => {
      setPrivateAccount(s.private_account);
      setPostViewPermission(s.post_view_permission);
      setCommentPermission(s.who_can_comment);
      setMentionPermission(s.mention_permission);
      setMessagePermission(s.who_can_message);
      setActivityVisibility(s.activity_visibility);
      setStoryPermission(s.story_permission);
      setStoryReplyPermission(s.story_reply_permission);
    }).catch(() => {});

    getGundrukProfile(userId).then((p) => {
      setShowInMatching(p.show_in_matching);
      setVibeRequestPrivacy(p.vibe_request_privacy);
    }).catch(() => {});
  }, [userId]);

  const save = (patch: Partial<UserSettings>) => {
    if (!userId) return;
    saveUserSettings(userId, patch);
    toast("Saved ✅");
  };

  const labelFor = (opts: { label: string; value: string }[], val: string) =>
    opts.find((o) => o.value === val)?.label ?? val;

  const chevron = <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />;

  return (
    <View style={[ps.screen, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[ps.header, { paddingTop: topInset + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={ps.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[ps.headerTitle, { color: colors.foreground }]}>Privacy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[ps.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >

        {/* ════ Account Privacy ════ */}
        <View style={ps.section}>
          <PSec label="Account Privacy" />
          <PCard>
            <PRow
              icon="lock-closed-outline" iconBg="#0EA5E9"
              label="Private Account"
              sub={privateAccount ? "Only approved followers can see your posts" : "Anyone can see your posts"}
              rightEl={
                <Switch
                  value={privateAccount}
                  onValueChange={(v) => { setPrivateAccount(v); save({ private_account: v }); }}
                  trackColor={{ false: colors.muted, true: "#7C3AED" }}
                  thumbColor="#fff"
                />
              }
            />
            <PRow
              icon="eye-outline" iconBg="#3B82F6"
              label="Who can see your posts"
              sub={`${labelFor(POST_VIEW_OPTIONS, postViewPermission)} · Coming soon`}
              onPress={() => setShowPostViewPicker(true)}
              rightEl={chevron}
              faded
              isLast
            />
          </PCard>
        </View>

        {/* ════ Interactions ════ */}
        <View style={ps.section}>
          <PSec label="Interactions" />
          <PCard>
            <PRow
              icon="chatbubble-outline" iconBg="#8B5CF6"
              label="Who can comment on your posts"
              sub={labelFor(COMMENT_OPTIONS, commentPermission)}
              onPress={() => setShowCommentPicker(true)}
              rightEl={chevron}
            />
            <PRow
              icon="at-outline" iconBg="#EC4899"
              label="Who can @mention & tag you"
              sub={labelFor(MENTION_OPTIONS, mentionPermission)}
              onPress={() => setShowMentionPicker(true)}
              rightEl={chevron}
            />
            <PRow
              icon="paper-plane-outline" iconBg="#10B981"
              label="Who can send you DMs"
              sub={labelFor(MESSAGE_OPTIONS, messagePermission)}
              onPress={() => setShowMessagePicker(true)}
              rightEl={chevron}
              isLast
            />
          </PCard>
        </View>

        {/* ════ Find Vibe ════ */}
        <View style={ps.section}>
          <PSec label="Find Vibe" />
          <PCard>
            <PRow
              icon="heart-outline" iconBg="#F43F5E"
              label="Show me in Find Vibe"
              sub={showInMatching ? "You appear in vibe discovery" : "Hidden from vibe discovery"}
              rightEl={
                <Switch
                  value={showInMatching}
                  onValueChange={(v) => {
                    setShowInMatching(v);
                    if (userId) saveGundrukProfile(userId, { show_in_matching: v });
                    toast(v ? "Visible in Find Vibe ✅" : "Hidden from Find Vibe ⏸");
                  }}
                  trackColor={{ false: colors.muted, true: "#F43F5E" }}
                  thumbColor="#fff"
                />
              }
            />
            <PRow
              icon="shield-half-outline" iconBg="#F97316"
              label="Who can send Vibe Requests"
              sub={labelFor(VIBE_REQUEST_OPTIONS, vibeRequestPrivacy)}
              onPress={showInMatching ? () => setShowVibePrivacyPicker(true) : undefined}
              rightEl={chevron}
              faded={!showInMatching}
              isLast
            />
          </PCard>
        </View>

        {/* ════ Activity & Visibility ════ */}
        <View style={ps.section}>
          <PSec label="Activity & Visibility" />
          <PCard>
            <PRow
              icon="radio-button-on-outline" iconBg="#06B6D4"
              label="Show Activity Status"
              sub={(activityVisibility ? "Others can see when you're online" : "Your activity status is hidden") + " · Coming soon"}
              rightEl={
                <Switch
                  value={activityVisibility}
                  onValueChange={(v) => { setActivityVisibility(v); save({ activity_visibility: v }); }}
                  trackColor={{ false: colors.muted, true: "#06B6D4" }}
                  thumbColor="#fff"
                  disabled
                />
              }
              faded
              isLast
            />
          </PCard>
        </View>

        {/* ════ Story Controls ════ */}
        <View style={ps.section}>
          <PSec label="Story Controls" />
          <PCard>
            <PRow
              icon="camera-outline" iconBg="#F59E0B"
              label="Who can see your Story"
              sub={labelFor(STORY_OPTIONS, storyPermission)}
              onPress={() => setShowStoryPicker(true)}
              rightEl={chevron}
            />
            <PRow
              icon="return-up-back-outline" iconBg="#6366F1"
              label="Allow Story Replies"
              sub={`${labelFor(STORY_REPLY_OPTIONS, storyReplyPermission)} · Coming soon`}
              onPress={() => setShowStoryReplyPicker(true)}
              rightEl={chevron}
              faded
              isLast
            />
          </PCard>
        </View>

      </ScrollView>

      <ToastView />

      {/* ── Pickers ── */}
      <OptionPicker
        visible={showPostViewPicker} title="Who can see your posts"
        options={POST_VIEW_OPTIONS} selected={postViewPermission}
        onSelect={(v) => { setPostViewPermission(v); save({ post_view_permission: v as any }); }}
        onClose={() => setShowPostViewPicker(false)}
      />
      <OptionPicker
        visible={showCommentPicker} title="Who can comment on your posts"
        options={COMMENT_OPTIONS} selected={commentPermission}
        onSelect={(v) => { setCommentPermission(v); save({ who_can_comment: v as any }); }}
        onClose={() => setShowCommentPicker(false)}
      />
      <OptionPicker
        visible={showMentionPicker} title="Who can @mention & tag you"
        options={MENTION_OPTIONS} selected={mentionPermission}
        onSelect={(v) => { setMentionPermission(v); save({ mention_permission: v as any }); }}
        onClose={() => setShowMentionPicker(false)}
      />
      <OptionPicker
        visible={showMessagePicker} title="Who can send you DMs"
        options={MESSAGE_OPTIONS} selected={messagePermission}
        onSelect={(v) => { setMessagePermission(v); save({ who_can_message: v as any }); }}
        onClose={() => setShowMessagePicker(false)}
      />
      <OptionPicker
        visible={showVibePrivacyPicker} title="Who can send Vibe Requests?"
        options={VIBE_REQUEST_OPTIONS} selected={vibeRequestPrivacy}
        onSelect={(v) => {
          setVibeRequestPrivacy(v);
          if (userId) {
            saveGundrukProfile(userId, { vibe_request_privacy: v });
            toast(v === "nobody" ? "Vibe Requests paused ⏸" : "Saved ✅");
          }
        }}
        onClose={() => setShowVibePrivacyPicker(false)}
      />
      <OptionPicker
        visible={showStoryPicker} title="Who can see your Story"
        options={STORY_OPTIONS} selected={storyPermission}
        onSelect={(v) => { setStoryPermission(v); save({ story_permission: v as any }); }}
        onClose={() => setShowStoryPicker(false)}
      />
      <OptionPicker
        visible={showStoryReplyPicker} title="Allow Story Replies"
        options={STORY_REPLY_OPTIONS} selected={storyReplyPermission}
        onSelect={(v) => { setStoryReplyPermission(v); save({ story_reply_permission: v as any }); }}
        onClose={() => setShowStoryReplyPicker(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ps = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  scrollContent: { padding: 16, gap: 8 },
  section: { marginBottom: 8 },
  secLabel: {
    fontSize: 12, fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase", letterSpacing: 0.8,
    marginBottom: 8, marginLeft: 4,
  },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  iconBox: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 15, fontFamily: "Poppins_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 1 },
});
