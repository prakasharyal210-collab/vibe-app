import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

interface SettingRowProps {
  icon: string;
  iconColor?: string;
  label: string;
  sub?: string;
  value?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  danger?: boolean;
  colors: any;
}

function SettingRow({ icon, iconColor = "#7C3AED", label, sub, value, onToggle, onPress, danger, colors }: SettingRowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress && onToggle === undefined}
      activeOpacity={0.75}
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
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

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const emailUsername = session?.user?.email?.split("@")[0] ?? "your_vibe";

  const [privateAccount, setPrivateAccount] = useState(false);
  const [commentPermission, setCommentPermission] = useState<"everyone" | "friends" | "nobody">("everyone");
  const [messagePermission, setMessagePermission] = useState<"everyone" | "friends" | "nobody">("everyone");
  const [duetPermission, setDuetPermission] = useState(true);
  const [likedPrivate, setLikedPrivate] = useState(false);
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifLive, setNotifLive] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [screenTime, setScreenTime] = useState(false);
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  const cyclePermission = (current: "everyone" | "friends" | "nobody") => {
    if (current === "everyone") return "friends";
    if (current === "friends") return "nobody";
    return "everyone";
  };

  const clearCache = () => {
    Alert.alert("Clear Cache?", "This will clear all cached data.", [
      { text: "Cancel" },
      { text: "Clear", style: "destructive", onPress: () => { setCacheCleared(true); Alert.alert("Done!", "Cache cleared successfully."); } },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert("Log Out?", "You'll need to sign in again.", [
      { text: "Cancel" },
      { text: "Log Out", style: "destructive", onPress: signOut },
    ]);
  };

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
        <View style={[styles.profileRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          <UserAvatar username={emailUsername} size={52} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{emailUsername}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{session?.user?.email ?? "Not signed in"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </View>

        <SectionHeader label="ACCOUNT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="person-outline" label="Username" sub={`@${emailUsername}`} onPress={() => Alert.alert("Change Username", "Enter new username:", [{ text: "Cancel" }, { text: "Save" }])} colors={colors} />
          <SettingRow icon="mail-outline" label="Email" sub={session?.user?.email ?? "—"} onPress={() => Alert.alert("Email", "Manage your email address")} colors={colors} />
          <SettingRow icon="call-outline" label="Phone Number" sub="Add phone number" onPress={() => Alert.alert("Phone", "Add a phone number for security")} colors={colors} />
          <SettingRow icon="lock-closed-outline" label="Password" onPress={() => Alert.alert("Password", "Change your password")} colors={colors} />
          <SettingRow icon="people-outline" label="Switch Accounts" onPress={() => Alert.alert("Switch Accounts", "Add another account")} colors={colors} />
        </View>

        <SectionHeader label="PRIVACY" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="lock-closed-outline" label="Private Account" sub={privateAccount ? "Only followers can see your content" : "Anyone can see your content"} value={privateAccount} onToggle={setPrivateAccount} colors={colors} />
          <SettingRow icon="chatbubble-outline" label="Who can comment" sub={commentPermission.charAt(0).toUpperCase() + commentPermission.slice(1)} onPress={() => setCommentPermission(cyclePermission(commentPermission))} colors={colors} />
          <SettingRow icon="repeat-outline" label="Who can duet/remix" sub={duetPermission ? "Everyone" : "Nobody"} value={duetPermission} onToggle={setDuetPermission} colors={colors} />
          <SettingRow icon="paper-plane-outline" label="Who can message me" sub={messagePermission.charAt(0).toUpperCase() + messagePermission.slice(1)} onPress={() => setMessagePermission(cyclePermission(messagePermission))} colors={colors} />
          <SettingRow icon="heart-outline" label="Liked videos" sub={likedPrivate ? "Only you" : "Public"} value={likedPrivate} onToggle={setLikedPrivate} colors={colors} />
          <SettingRow icon="ban-outline" label="Blocked Accounts" onPress={() => Alert.alert("Blocked Accounts", "No accounts blocked")} colors={colors} />
          <SettingRow icon="eye-off-outline" label="Restricted Accounts" onPress={() => Alert.alert("Restricted Accounts", "No restricted accounts")} colors={colors} />
        </View>

        <SectionHeader label="NOTIFICATIONS" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="heart-outline" label="Likes" value={notifLikes} onToggle={setNotifLikes} colors={colors} />
          <SettingRow icon="chatbubble-outline" label="Comments" value={notifComments} onToggle={setNotifComments} colors={colors} />
          <SettingRow icon="person-add-outline" label="New Followers" value={notifFollows} onToggle={setNotifFollows} colors={colors} />
          <SettingRow icon="radio-outline" label="Live Streams" value={notifLive} onToggle={setNotifLive} colors={colors} />
          <SettingRow icon="at-outline" label="Mentions" value={notifMentions} onToggle={setNotifMentions} colors={colors} />
        </View>

        <SectionHeader label="DIGITAL WELLBEING" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="time-outline" label="Screen Time Management" sub={screenTime ? "2h daily limit set" : "No limit"} value={screenTime} onToggle={setScreenTime} colors={colors} />
          <SettingRow icon="shield-outline" label="Restricted Mode" sub="Filter mature content" value={restrictedMode} onToggle={setRestrictedMode} colors={colors} />
        </View>

        <SectionHeader label="ACCESSIBILITY" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="text-outline" label="Text Size" sub="System default" onPress={() => Alert.alert("Text Size", "Adjust text size")} colors={colors} />
          <SettingRow icon="contrast-outline" label="Display" sub="High contrast: Off" onPress={() => Alert.alert("Display", "Adjust display settings")} colors={colors} />
          <SettingRow icon="volume-high-outline" label="Sound & Vibration" onPress={() => Alert.alert("Sound", "Adjust sound settings")} colors={colors} />
        </View>

        <SectionHeader label="LANGUAGE & DATA" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="language-outline" label="Language" sub="English" onPress={() => Alert.alert("Language", "Select language")} colors={colors} />
          <SettingRow icon="server-outline" label="Data & Storage" sub="Auto-play on Wi-Fi only" onPress={() => Alert.alert("Data", "Manage data usage")} colors={colors} />
          <SettingRow icon="trash-outline" label="Clear Cache" sub={cacheCleared ? "Cache cleared" : "Free up storage space"} onPress={clearCache} colors={colors} />
        </View>

        <SectionHeader label="ABOUT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => Alert.alert("Terms", "vibe.app/terms")} colors={colors} />
          <SettingRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => Alert.alert("Privacy", "vibe.app/privacy")} colors={colors} />
          <SettingRow icon="information-circle-outline" label="App Version" sub="Vibe v1.0.0 (build 1)" colors={colors} />
          <SettingRow icon="bug-outline" label="Report a Problem" onPress={() => Alert.alert("Report", "Describe your issue and we'll look into it.")} colors={colors} />
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TouchableOpacity onPress={handleSignOut} style={[styles.logoutBtn, { borderColor: "#EF4444" }]}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  section: { marginHorizontal: 0, borderTopWidth: 0.5, borderBottomWidth: 0.5 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 0.5, gap: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  rowSub: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, borderWidth: 1.5 },
  logoutText: { color: "#EF4444", fontSize: 15, fontFamily: "Poppins_700Bold" },
});
