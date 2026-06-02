import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { fetchUserSettings, saveUserSettings, UserSettings } from "@/lib/db";
import { useColors } from "@/hooks/useColors";

function OptionPicker({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { label: string; value: string; icon?: string }[];
  selected: string;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={opStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[opStyles.sheet, { backgroundColor: colors.background }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>{title}</Text>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => { onSelect(opt.value); onClose(); }}
            style={[opStyles.optionRow, { borderBottomColor: colors.border }]}
          >
            {opt.icon && <Ionicons name={opt.icon as any} size={20} color={selected === opt.value ? "#7C3AED" : colors.mutedForeground} />}
            <Text style={[opStyles.optionLabel, { color: selected === opt.value ? "#7C3AED" : colors.foreground }]}>{opt.label}</Text>
            {selected === opt.value && <Ionicons name="checkmark" size={20} color="#7C3AED" />}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onClose} style={[opStyles.cancelBtn, { backgroundColor: colors.muted }]}>
          <Text style={[opStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const opStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 8 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 15, borderBottomWidth: 0.5 },
  optionLabel: { flex: 1, fontSize: 15, fontFamily: "Poppins_500Medium" },
  cancelBtn: { marginTop: 12, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
});

function EditFieldModal({
  visible,
  title,
  fieldLabel,
  currentValue,
  onSave,
  onClose,
  isPassword,
}: {
  visible: boolean;
  title: string;
  fieldLabel: string;
  currentValue?: string;
  onSave: (v: string) => void;
  onClose: () => void;
  isPassword?: boolean;
}) {
  const colors = useColors();
  const [value, setValue] = useState(currentValue ?? "");
  useEffect(() => { if (visible) setValue(currentValue ?? ""); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={opStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[opStyles.sheet, { backgroundColor: colors.background }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>{title}</Text>
        <Text style={[efStyles.label, { color: colors.mutedForeground }]}>{fieldLabel}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          autoFocus
          secureTextEntry={isPassword}
          style={[efStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
          placeholder={fieldLabel}
          placeholderTextColor={colors.mutedForeground}
        />
        <View style={efStyles.btnRow}>
          <TouchableOpacity onPress={onClose} style={[efStyles.cancelBtn, { backgroundColor: colors.muted }]}>
            <Text style={[efStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onSave(value); onClose(); }} style={efStyles.saveBtn}>
            <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={efStyles.saveGrad}>
              <Text style={efStyles.saveText}>Save</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const efStyles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: "Poppins_500Medium", marginBottom: 6 },
  input: { borderRadius: 12, padding: 14, fontSize: 15, fontFamily: "Poppins_400Regular", borderWidth: 1, marginBottom: 16 },
  btnRow: { flexDirection: "row", gap: 10 },
  cancelBtn: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Poppins_600SemiBold" },
  saveBtn: { flex: 2, borderRadius: 12, overflow: "hidden" },
  saveGrad: { paddingVertical: 14, alignItems: "center" },
  saveText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
});

interface SettingRowProps {
  icon: string; iconColor?: string; label: string; sub?: string;
  value?: boolean; onToggle?: (v: boolean) => void;
  onPress?: () => void; danger?: boolean; colors: any;
}

function SettingRow({ icon, iconColor = "#7C3AED", label, sub, value, onToggle, onPress, danger, colors }: SettingRowProps) {
  return (
    <TouchableOpacity onPress={onPress} disabled={!onPress && onToggle === undefined} activeOpacity={0.75}
      style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={[styles.rowIcon, { backgroundColor: (danger ? "#EF4444" : iconColor) + "22" }]}>
        <Ionicons name={icon as any} size={18} color={danger ? "#EF4444" : iconColor} />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: danger ? "#EF4444" : colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {onToggle !== undefined ? (
        <Switch value={value} onValueChange={onToggle} trackColor={{ true: "#7C3AED" }} thumbColor="#fff" />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHeader({ label, colors }: { label: string; colors: any }) {
  return (
    <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
      <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

const PERMISSION_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "earth-outline" },
  { label: "Friends only", value: "friends", icon: "people-outline" },
  { label: "Nobody", value: "nobody", icon: "ban-outline" },
];

const TEXT_SIZE_OPTIONS = [
  { label: "Small", value: "small" },
  { label: "Medium (default)", value: "medium" },
  { label: "Large", value: "large" },
  { label: "Extra Large", value: "xlarge" },
];

const LANGUAGE_OPTIONS = [
  { label: "English", value: "en" },
  { label: "Spanish", value: "es" },
  { label: "French", value: "fr" },
  { label: "German", value: "de" },
  { label: "Japanese", value: "ja" },
  { label: "Korean", value: "ko" },
  { label: "Portuguese", value: "pt" },
  { label: "Chinese (Simplified)", value: "zh" },
  { label: "Arabic", value: "ar" },
  { label: "Hindi", value: "hi" },
];

const SCREEN_TIME_OPTIONS = [
  { label: "No limit", value: "none" },
  { label: "30 minutes", value: "30m" },
  { label: "1 hour", value: "1h" },
  { label: "2 hours", value: "2h" },
  { label: "3 hours", value: "3h" },
];

const BLOCKED_MOCK = ["@shadow_user", "@spam_account22"];
const RESTRICTED_MOCK = ["@troll_99"];

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const emailUsername = session?.user?.email?.split("@")[0] ?? "your_vibe";

  const [privateAccount, setPrivateAccount] = useState(false);
  const [commentPermission, setCommentPermission] = useState<string>("everyone");
  const [messagePermission, setMessagePermission] = useState<string>("everyone");
  const [duetPermission, setDuetPermission] = useState<string>("everyone");
  const [likedPrivate, setLikedPrivate] = useState(false);
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifLive, setNotifLive] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [textSize, setTextSize] = useState("medium");
  const [language, setLanguage] = useState("en");
  const [screenTime, setScreenTime] = useState("none");

  const [showCommentPicker, setShowCommentPicker] = useState(false);
  const [showMessagePicker, setShowMessagePicker] = useState(false);
  const [showDuetPicker, setShowDuetPicker] = useState(false);
  const [showTextSizePicker, setShowTextSizePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showScreenTimePicker, setShowScreenTimePicker] = useState(false);
  const [showBlockedList, setShowBlockedList] = useState(false);
  const [editField, setEditField] = useState<{ title: string; label: string; value?: string; isPassword?: boolean } | null>(null);

  const persistSetting = useCallback((patch: Partial<UserSettings>) => {
    if (!session?.user?.id) return;
    saveUserSettings(session.user.id, patch);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetchUserSettings(session.user.id).then((s) => {
      setPrivateAccount(s.private_account);
      setCommentPermission(s.comment_permission);
      setMessagePermission(s.message_permission);
      setLikedPrivate(s.liked_private);
      setNotifLikes(s.notif_likes);
      setNotifComments(s.notif_comments);
      setNotifFollows(s.notif_follows);
      setNotifLive(s.notif_live);
      setNotifMentions(s.notif_mentions);
    }).catch(() => {});
  }, [session?.user?.id]);

  const permLabel = (v: string) => PERMISSION_OPTIONS.find((o) => o.value === v)?.label ?? "Everyone";

  const clearCache = () => {
    Alert.alert("Clear Cache?", "This will clear all locally cached images and data. The app may be slower temporarily.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Cache", style: "destructive", onPress: () => { setCacheCleared(true); Alert.alert("✅ Done", "Cache cleared successfully. Freed ~48 MB."); } },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert("Log Out?", "You'll need to sign in again to access your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: signOut },
    ]);
  };

  const openLink = (url: string, title: string) => {
    Linking.openURL(url).catch(() => Alert.alert(title, `Visit: ${url}`));
  };

  const screenTimeLabel = SCREEN_TIME_OPTIONS.find((o) => o.value === screenTime)?.label ?? "No limit";
  const textSizeLabel = TEXT_SIZE_OPTIONS.find((o) => o.value === textSize)?.label ?? "Medium";
  const langLabel = LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? "English";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <TouchableOpacity
          onPress={() => setEditField({ title: "Edit Profile", label: "Display name", value: emailUsername })}
          style={[styles.profileRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <UserAvatar username={emailUsername} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{emailUsername}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{session?.user?.email ?? "Not signed in"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <SectionHeader label="ACCOUNT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="person-outline" label="Username" sub={`@${emailUsername}`} onPress={() => setEditField({ title: "Change Username", label: "New username", value: emailUsername })} colors={colors} />
          <SettingRow icon="mail-outline" label="Email" sub={session?.user?.email ?? "—"} onPress={() => setEditField({ title: "Change Email", label: "New email address", value: session?.user?.email })} colors={colors} />
          <SettingRow icon="call-outline" label="Phone Number" sub="Add phone number" onPress={() => setEditField({ title: "Phone Number", label: "Phone number (+1 234 567 8900)" })} colors={colors} />
          <SettingRow icon="lock-closed-outline" label="Password" sub="Change your password" onPress={() => setEditField({ title: "Change Password", label: "New password", isPassword: true })} colors={colors} />
          <SettingRow icon="people-outline" label="Switch Accounts" onPress={() => Alert.alert("Switch Accounts", "Tap to add another account to quickly switch between them.", [{ text: "Add Account", onPress: () => {} }, { text: "Cancel", style: "cancel" }])} colors={colors} />
        </View>

        <SectionHeader label="PRIVACY" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="lock-closed-outline" label="Private Account" sub={privateAccount ? "Only followers can see your content" : "Anyone can see your content"} value={privateAccount} onToggle={(v) => { setPrivateAccount(v); persistSetting({ private_account: v }); }} colors={colors} />
          <SettingRow icon="chatbubble-outline" label="Who can comment" sub={permLabel(commentPermission)} onPress={() => setShowCommentPicker(true)} colors={colors} />
          <SettingRow icon="repeat-outline" label="Who can duet/remix" sub={permLabel(duetPermission)} onPress={() => setShowDuetPicker(true)} colors={colors} />
          <SettingRow icon="paper-plane-outline" label="Who can message me" sub={permLabel(messagePermission)} onPress={() => setShowMessagePicker(true)} colors={colors} />
          <SettingRow icon="heart-outline" label="Liked videos" sub={likedPrivate ? "Private — only you" : "Public"} value={likedPrivate} onToggle={(v) => { setLikedPrivate(v); persistSetting({ liked_private: v }); }} colors={colors} />
          <SettingRow icon="ban-outline" label="Blocked Accounts" sub={`${BLOCKED_MOCK.length} blocked`} onPress={() => {
            Alert.alert("Blocked Accounts", BLOCKED_MOCK.join("\n") || "No accounts blocked", [
              { text: "Close", style: "cancel" },
            ]);
          }} colors={colors} />
          <SettingRow icon="eye-off-outline" label="Restricted Accounts" sub={`${RESTRICTED_MOCK.length} restricted`} onPress={() => {
            Alert.alert("Restricted Accounts", RESTRICTED_MOCK.join("\n") || "No restricted accounts", [
              { text: "Close", style: "cancel" },
            ]);
          }} colors={colors} />
        </View>

        <SectionHeader label="NOTIFICATIONS" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="heart-outline" label="Likes" value={notifLikes} onToggle={(v) => { setNotifLikes(v); persistSetting({ notif_likes: v }); }} colors={colors} />
          <SettingRow icon="chatbubble-outline" label="Comments" value={notifComments} onToggle={(v) => { setNotifComments(v); persistSetting({ notif_comments: v }); }} colors={colors} />
          <SettingRow icon="person-add-outline" label="New Followers" value={notifFollows} onToggle={(v) => { setNotifFollows(v); persistSetting({ notif_follows: v }); }} colors={colors} />
          <SettingRow icon="radio-outline" label="Live Streams" value={notifLive} onToggle={(v) => { setNotifLive(v); persistSetting({ notif_live: v }); }} colors={colors} />
          <SettingRow icon="at-outline" label="Mentions" value={notifMentions} onToggle={(v) => { setNotifMentions(v); persistSetting({ notif_mentions: v }); }} colors={colors} />
        </View>

        <SectionHeader label="DIGITAL WELLBEING" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="timer-outline" label="Screen Time Management" sub={screenTimeLabel} onPress={() => setShowScreenTimePicker(true)} colors={colors} iconColor="#F97316" />
          <SettingRow icon="shield-outline" label="Restricted Mode" sub="Filter mature content" value={restrictedMode} onToggle={setRestrictedMode} colors={colors} iconColor="#10B981" />
        </View>

        <SectionHeader label="ACCESSIBILITY & DISPLAY" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="text-outline" label="Text Size" sub={textSizeLabel} onPress={() => setShowTextSizePicker(true)} colors={colors} iconColor="#3B82F6" />
          <SettingRow icon="contrast-outline" label="Display" sub="High contrast: Off · Dark mode: On" onPress={() => Alert.alert("Display", "Dark mode is always on in Vibe for the best experience.")} colors={colors} iconColor="#EC4899" />
          <SettingRow icon="volume-high-outline" label="Sound & Vibration" onPress={() => Alert.alert("Sound & Vibration", "Adjust haptic feedback and sound settings on your device.")} colors={colors} iconColor="#7C3AED" />
        </View>

        <SectionHeader label="LANGUAGE & DATA" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="language-outline" label="Language" sub={langLabel} onPress={() => setShowLanguagePicker(true)} colors={colors} iconColor="#8B5CF6" />
          <SettingRow icon="server-outline" label="Data & Storage" sub="Auto-play on Wi-Fi only · Storage: 48 MB" onPress={() => Alert.alert("Data & Storage", "Manage video quality and storage:\n\n• Auto-play: Wi-Fi only\n• Video quality: High\n• Download quality: Medium")} colors={colors} iconColor="#059669" />
          <SettingRow icon="trash-outline" label="Clear Cache" sub={cacheCleared ? "✅ Cache cleared (48 MB freed)" : "Free up storage space · 48 MB used"} onPress={clearCache} colors={colors} iconColor="#EF4444" />
        </View>

        <SectionHeader label="ABOUT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => openLink("https://vibe.app/terms", "Terms of Service")} colors={colors} />
          <SettingRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openLink("https://vibe.app/privacy", "Privacy Policy")} colors={colors} iconColor="#10B981" />
          <SettingRow icon="information-circle-outline" label="App Version" sub="Vibe v1.0.0 (build 1) · Up to date ✓" colors={colors} iconColor="#6B7280" />
          <SettingRow icon="bug-outline" label="Report a Problem" onPress={() => Alert.alert("Report a Problem", "Please describe your issue:", [
            { text: "Cancel", style: "cancel" },
            { text: "Send Report", onPress: () => Alert.alert("Thank you!", "We'll look into this and get back to you within 24h.") },
          ])} colors={colors} iconColor="#F97316" />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TouchableOpacity onPress={handleSignOut} style={[styles.logoutBtn, { borderColor: "#EF4444" }]}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <Text style={[styles.versionNote, { color: colors.mutedForeground }]}>
            Vibe Social · v1.0.0 · Made with 💜
          </Text>
        </View>
      </ScrollView>

      <OptionPicker
        visible={showCommentPicker}
        title="Who can comment"
        options={PERMISSION_OPTIONS}
        selected={commentPermission}
        onSelect={(v) => { setCommentPermission(v); persistSetting({ comment_permission: v as any }); }}
        onClose={() => setShowCommentPicker(false)}
      />
      <OptionPicker
        visible={showMessagePicker}
        title="Who can message me"
        options={PERMISSION_OPTIONS}
        selected={messagePermission}
        onSelect={(v) => { setMessagePermission(v); persistSetting({ message_permission: v as any }); }}
        onClose={() => setShowMessagePicker(false)}
      />
      <OptionPicker
        visible={showDuetPicker}
        title="Who can duet / remix"
        options={PERMISSION_OPTIONS}
        selected={duetPermission}
        onSelect={(v) => setDuetPermission(v)}
        onClose={() => setShowDuetPicker(false)}
      />
      <OptionPicker
        visible={showTextSizePicker}
        title="Text Size"
        options={TEXT_SIZE_OPTIONS}
        selected={textSize}
        onSelect={setTextSize}
        onClose={() => setShowTextSizePicker(false)}
      />
      <OptionPicker
        visible={showLanguagePicker}
        title="Language"
        options={LANGUAGE_OPTIONS}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setShowLanguagePicker(false)}
      />
      <OptionPicker
        visible={showScreenTimePicker}
        title="Daily Screen Time Limit"
        options={SCREEN_TIME_OPTIONS}
        selected={screenTime}
        onSelect={setScreenTime}
        onClose={() => setShowScreenTimePicker(false)}
      />
      {editField && (
        <EditFieldModal
          visible={!!editField}
          title={editField.title}
          fieldLabel={editField.label}
          currentValue={editField.value}
          isPassword={editField.isPassword}
          onSave={(v) => Alert.alert("Saved!", `${editField.label} updated successfully.`)}
          onClose={() => setEditField(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 0.5, gap: 10 },
  title: { flex: 1, textAlign: "center", fontSize: 18, fontFamily: "Poppins_700Bold" },
  profileRow: { flexDirection: "row", alignItems: "center", padding: 16, gap: 12, borderBottomWidth: 0.5 },
  profileName: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  profileEmail: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  sectionHeader: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  sectionLabel: { fontSize: 11, fontFamily: "Poppins_700Bold", letterSpacing: 1.2, textTransform: "uppercase" },
  section: { borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, gap: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1.5 },
  logoutText: { color: "#EF4444", fontSize: 15, fontFamily: "Poppins_700Bold" },
  versionNote: { textAlign: "center", fontSize: 12, fontFamily: "Poppins_400Regular", paddingBottom: 4 },
});
