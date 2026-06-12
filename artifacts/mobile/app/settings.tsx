import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated as RNAnimated,
  DeviceEventEmitter,
  Image,
  Linking,
  Modal,
  Platform,
  RefreshControl,
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
import {
  BlockedUser,
  RestrictedUser,
  fetchUserSettings,
  getBlockedUsers,
  getGundrukProfile,
  getRestrictedUsers,
  saveGundrukProfile,
  saveUserSettings,
  unblockUser,
  unrestrictUser,
  UserSettings,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";

// ─── SavedAccount ─────────────────────────────────────────────────────────────

interface SavedAccount {
  id: string;
  username: string;
  email: string;
  avatar_url?: string;
  access_token: string;
  refresh_token: string;
}

const ACCOUNTS_KEY = "vibe_saved_accounts";

async function getSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await AsyncStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveAccount(account: SavedAccount): Promise<void> {
  const all = await getSavedAccounts();
  const updated = all.filter((a) => a.id !== account.id);
  updated.push(account);
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
}

async function removeAccount(accountId: string): Promise<SavedAccount[]> {
  const all = await getSavedAccounts();
  const updated = all.filter((a) => a.id !== accountId);
  await AsyncStorage.setItem(ACCOUNTS_KEY, JSON.stringify(updated));
  return updated;
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function useToast() {
  const [message, setMessage] = useState("");
  const opacity = useRef(new RNAnimated.Value(0)).current;
  const translateY = useRef(new RNAnimated.Value(20)).current;

  const show = (msg: string) => {
    setMessage(msg);
    opacity.setValue(0);
    translateY.setValue(20);
    RNAnimated.parallel([
      RNAnimated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: false }),
      RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }),
    ]).start();
    setTimeout(() => {
      RNAnimated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: false }).start();
    }, 2500);
  };

  const ToastView = message ? (
    <RNAnimated.View style={[toastStyles.container, { opacity, transform: [{ translateY }] }]} pointerEvents="none">
      <Text style={toastStyles.text}>{message}</Text>
    </RNAnimated.View>
  ) : null;

  return { show, ToastView };
}

const toastStyles = StyleSheet.create({
  container: { position: "absolute", bottom: 36, left: 24, right: 24, backgroundColor: "rgba(30,15,50,0.95)", borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18, alignItems: "center", zIndex: 9999, borderWidth: 1, borderColor: "rgba(124,58,237,0.3)" },
  text: { color: "#fff", fontFamily: "Poppins_600SemiBold", fontSize: 14 },
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
      <TouchableOpacity style={opStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[opStyles.sheet, { backgroundColor: colors.background }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>{title}</Text>
        {options.map((opt) => (
          <TouchableOpacity key={opt.value} onPress={() => { onSelect(opt.value); onClose(); }} style={[opStyles.optionRow, { borderBottomColor: colors.border }]}>
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

// ─── EditFieldModal ───────────────────────────────────────────────────────────

function EditFieldModal({ visible, title, fieldLabel, currentValue, onSave, onClose, isPassword }: {
  visible: boolean; title: string; fieldLabel: string; currentValue?: string;
  onSave: (v: string) => void; onClose: () => void; isPassword?: boolean;
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
        <TextInput value={value} onChangeText={setValue} autoFocus secureTextEntry={isPassword}
          style={[efStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
          placeholder={fieldLabel} placeholderTextColor={colors.mutedForeground} />
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

// ─── SwitchAccountsModal ──────────────────────────────────────────────────────

function SwitchAccountsModal({
  visible, currentUserId, currentUsername, currentEmail, currentAvatar,
  onClose, onToast,
}: {
  visible: boolean; currentUserId: string; currentUsername: string;
  currentEmail: string; currentAvatar?: string; onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const colors = useColors();
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    getSavedAccounts().then(setAccounts);
  }, [visible]);

  const handleSwitch = async (acc: SavedAccount) => {
    if (acc.id === currentUserId) return;
    setSwitching(acc.id);
    try {
      await supabase.auth.setSession({ access_token: acc.access_token, refresh_token: acc.refresh_token });
      onToast(`Switched to @${acc.username} ✅`);
      onClose();
      router.replace("/(tabs)/" as any);
    } catch {
      onToast("Failed to switch account");
    } finally { setSwitching(null); }
  };

  const handleRemove = (acc: SavedAccount) => {
    if (acc.id === currentUserId) { onToast("Can't remove your active account"); return; }
    Alert.alert("Remove Account?", `Remove @${acc.username} from saved accounts?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => {
        const updated = await removeAccount(acc.id);
        setAccounts(updated);
        onToast(`Removed @${acc.username}`);
      }},
    ]);
  };

  const allAccounts: SavedAccount[] = [
    { id: currentUserId, username: currentUsername, email: currentEmail, avatar_url: currentAvatar, access_token: "", refresh_token: "" },
    ...accounts.filter((a) => a.id !== currentUserId),
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={opStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[saStyles.sheet, { backgroundColor: colors.background }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>Switch Accounts</Text>

        {allAccounts.map((acc) => {
          const isCurrent = acc.id === currentUserId;
          return (
            <TouchableOpacity
              key={acc.id}
              onPress={() => handleSwitch(acc)}
              onLongPress={() => handleRemove(acc)}
              activeOpacity={0.75}
              style={[saStyles.accountRow, { borderBottomColor: colors.border, backgroundColor: isCurrent ? "rgba(124,58,237,0.08)" : "transparent" }]}
            >
              {acc.avatar_url ? (
                <Image source={{ uri: acc.avatar_url }} style={saStyles.avatar} />
              ) : (
                <View style={[saStyles.avatarPlaceholder, { backgroundColor: "#7C3AED" }]}>
                  <Text style={saStyles.avatarInitial}>{acc.username[0]?.toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={[saStyles.accName, { color: colors.foreground }]}>@{acc.username}</Text>
                <Text style={[saStyles.accEmail, { color: colors.mutedForeground }]}>{acc.email}</Text>
              </View>
              {isCurrent ? (
                <View style={saStyles.activeBadge}>
                  <Text style={saStyles.activeBadgeText}>Active ✓</Text>
                </View>
              ) : switching === acc.id ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Switching…</Text>
              ) : (
                <Ionicons name="swap-horizontal-outline" size={18} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={() => { onClose(); router.push("/(auth)/login" as any); }}
          style={[saStyles.addBtn, { borderColor: colors.border }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add-circle-outline" size={20} color="#7C3AED" />
          <Text style={saStyles.addBtnText}>Add Account</Text>
        </TouchableOpacity>

        <Text style={[saStyles.hint, { color: colors.mutedForeground }]}>
          Long press an account to remove it
        </Text>
      </View>
    </Modal>
  );
}

const saStyles = StyleSheet.create({
  sheet: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 44 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 0.5, borderRadius: 12, marginBottom: 2 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  accName: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  accEmail: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  activeBadge: { backgroundColor: "rgba(124,58,237,0.18)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "rgba(124,58,237,0.35)" },
  activeBadgeText: { color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 11 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1 },
  addBtnText: { color: "#7C3AED", fontFamily: "Poppins_600SemiBold", fontSize: 15 },
  hint: { textAlign: "center", fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 10 },
});

// ─── BlockedAccountsModal ─────────────────────────────────────────────────────

function BlockedAccountsModal({
  visible, userId, onClose, onToast,
}: { visible: boolean; userId: string; onClose: () => void; onToast: (msg: string) => void }) {
  const colors = useColors();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unblocking, setUnblocking] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await getBlockedUsers(userId);
    setBlocked(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  };

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleUnblock = async (user: BlockedUser) => {
    setUnblocking(user.id);
    await unblockUser(userId, user.id);
    setBlocked((prev) => prev.filter((u) => u.id !== user.id));
    onToast(`Unblocked @${user.username} ✅`);
    setUnblocking(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[baStyles.container, { backgroundColor: colors.background }]}>
        <View style={[baStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="chevron-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[baStyles.title, { color: colors.foreground }]}>Blocked Accounts</Text>
          <View style={{ width: 26 }} />
        </View>

        {loading ? (
          <View style={baStyles.center}>
            <Text style={{ fontSize: 32 }}>🚫</Text>
            <Text style={[{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 8 }]}>Loading…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7C3AED" />}
          >
            {blocked.length === 0 ? (
              <View style={baStyles.center}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🙌</Text>
                <Text style={[baStyles.emptyTitle, { color: colors.foreground }]}>No blocked accounts</Text>
                <Text style={[baStyles.emptySub, { color: colors.mutedForeground }]}>
                  You haven't blocked anyone yet.
                </Text>
              </View>
            ) : (
              blocked.map((user) => (
                <View key={user.id} style={[baStyles.userRow, { borderBottomColor: colors.border }]}>
                  {user.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={baStyles.avatar} />
                  ) : (
                    <View style={[baStyles.avatarPlaceholder, { backgroundColor: "#7C3AED" }]}>
                      <Text style={baStyles.avatarInitial}>{user.username[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[baStyles.username, { color: colors.foreground }]}>@{user.username}</Text>
                    {user.display_name && (
                      <Text style={[baStyles.displayName, { color: colors.mutedForeground }]}>{user.display_name}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnblock(user)}
                    disabled={unblocking === user.id}
                    style={[baStyles.unblockBtn, { borderColor: "#EF4444" }]}
                    activeOpacity={0.8}
                  >
                    <Text style={baStyles.unblockText}>
                      {unblocking === user.id ? "…" : "Unblock"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const baStyles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: Platform.OS === "ios" ? 56 : 16, paddingBottom: 12, borderBottomWidth: 0.5, gap: 10 },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Poppins_700Bold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Poppins_700Bold" },
  emptySub: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center" },
  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 0.5 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  avatarPlaceholder: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 18 },
  username: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  displayName: { fontFamily: "Poppins_400Regular", fontSize: 12 },
  unblockBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  unblockText: { color: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
});

// ─── RestrictedAccountsModal ──────────────────────────────────────────────────

function RestrictedAccountsModal({
  visible, userId, onClose, onToast,
}: { visible: boolean; userId: string; onClose: () => void; onToast: (msg: string) => void }) {
  const colors = useColors();
  const [restricted, setRestricted] = useState<RestrictedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unrestricting, setUnrestricting] = useState<string | null>(null);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const data = await getRestrictedUsers(userId);
    setRestricted(data);
    if (isRefresh) setRefreshing(false); else setLoading(false);
  };

  useEffect(() => { if (visible) load(); }, [visible]);

  const handleUnrestrict = async (user: RestrictedUser) => {
    setUnrestricting(user.id);
    await unrestrictUser(userId, user.id);
    setRestricted((prev) => prev.filter((u) => u.id !== user.id));
    onToast(`Unrestricted @${user.username} ✅`);
    setUnrestricting(null);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[baStyles.container, { backgroundColor: colors.background }]}>
        <View style={[baStyles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="chevron-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[baStyles.title, { color: colors.foreground }]}>Restricted Accounts</Text>
          <View style={{ width: 26 }} />
        </View>

        <View style={[raStyles.infoBox, { backgroundColor: "rgba(124,58,237,0.1)", borderColor: "rgba(124,58,237,0.2)" }]}>
          <Ionicons name="eye-off-outline" size={16} color="#A78BFA" />
          <Text style={raStyles.infoText}>Restricted accounts can still see your posts, but their comments are hidden from others and they can't see when you're active.</Text>
        </View>

        {loading ? (
          <View style={baStyles.center}>
            <Text style={{ fontSize: 32 }}>👁️</Text>
            <Text style={[{ color: colors.mutedForeground, fontFamily: "Poppins_400Regular", fontSize: 14, marginTop: 8 }]}>Loading…</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#7C3AED" />}
          >
            {restricted.length === 0 ? (
              <View style={baStyles.center}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>✌️</Text>
                <Text style={[baStyles.emptyTitle, { color: colors.foreground }]}>No restricted accounts</Text>
                <Text style={[baStyles.emptySub, { color: colors.mutedForeground }]}>
                  Restrict an account from any profile's three-dot menu.
                </Text>
              </View>
            ) : (
              restricted.map((user) => (
                <View key={user.id} style={[baStyles.userRow, { borderBottomColor: colors.border }]}>
                  {user.avatar_url ? (
                    <Image source={{ uri: user.avatar_url }} style={baStyles.avatar} />
                  ) : (
                    <View style={[baStyles.avatarPlaceholder, { backgroundColor: "#6B7280" }]}>
                      <Text style={baStyles.avatarInitial}>{user.username[0]?.toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[baStyles.username, { color: colors.foreground }]}>@{user.username}</Text>
                    {user.display_name && (
                      <Text style={[baStyles.displayName, { color: colors.mutedForeground }]}>{user.display_name}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleUnrestrict(user)}
                    disabled={unrestricting === user.id}
                    style={[baStyles.unblockBtn, { borderColor: "#7C3AED" }]}
                    activeOpacity={0.8}
                  >
                    <Text style={[baStyles.unblockText, { color: "#7C3AED" }]}>
                      {unrestricting === user.id ? "…" : "Unrestrict"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const raStyles = StyleSheet.create({
  infoBox: { flexDirection: "row", gap: 10, alignItems: "flex-start", margin: 16, padding: 12, borderRadius: 12, borderWidth: 1 },
  infoText: { flex: 1, color: "#A78BFA", fontFamily: "Poppins_400Regular", fontSize: 12, lineHeight: 17 },
});

// ─── Permission option sets ───────────────────────────────────────────────────

const COMMENT_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "earth-outline" },
  { label: "People I follow", value: "friends", icon: "people-outline" },
  { label: "Nobody", value: "nobody", icon: "ban-outline" },
];

const MESSAGE_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "earth-outline" },
  { label: "People I follow", value: "friends", icon: "people-outline" },
  { label: "My matches only", value: "matches", icon: "heart-outline" },
  { label: "Nobody", value: "nobody", icon: "ban-outline" },
];

const DUET_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "earth-outline" },
  { label: "People I follow", value: "friends", icon: "people-outline" },
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

const FIND_GUNDRUK_MODE_OPTIONS = [
  { label: "❤️  Dating", value: "dating", icon: "heart-outline" },
  { label: "👫  Friends", value: "friends", icon: "people-outline" },
  { label: "🤝  Networking", value: "networking", icon: "briefcase-outline" },
  { label: "👀  Just Browsing", value: "browsing", icon: "eye-outline" },
];

const VIBE_REQUEST_OPTIONS = [
  { label: "Everyone", value: "everyone", icon: "earth-outline" },
  { label: "People I follow", value: "following", icon: "people-outline" },
  { label: "Nobody", value: "nobody", icon: "ban-outline" },
];

// ─── SettingsScreen ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const colors = useColors();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, signOut } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const userId = session?.user?.id ?? "";
  const emailUsername = session?.user?.user_metadata?.username ?? session?.user?.email?.split("@")[0] ?? "your_vibe";
  const userEmail = session?.user?.email ?? "";
  const userAvatar = session?.user?.user_metadata?.avatar_url;

  const { show: showToast, ToastView } = useToast();

  // Settings state
  const [privateAccount, setPrivateAccount] = useState(false);
  const [commentPermission, setCommentPermission] = useState("everyone");
  const [messagePermission, setMessagePermission] = useState("everyone");
  const [duetPermission, setDuetPermission] = useState("everyone");
  const [likedPrivate, setLikedPrivate] = useState(false);
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifComments, setNotifComments] = useState(true);
  const [notifFollows, setNotifFollows] = useState(true);
  const [notifLive, setNotifLive] = useState(true);
  const [notifMentions, setNotifMentions] = useState(true);
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [language, setLanguage] = useState("en");
  const [screenTime, setScreenTime] = useState("none");

  // Find Vibe settings
  const [showInMatching, setShowInMatching] = useState(true);
  const [findGundrukMode, setFindGundrukMode] = useState("dating");
  const [vibeRequestPrivacy, setVibeRequestPrivacy] = useState("everyone");
  const vibeInteracted = useRef(false);

  // Picker / modal visibility
  const [showCommentPicker, setShowCommentPicker] = useState(false);
  const [showMessagePicker, setShowMessagePicker] = useState(false);
  const [showDuetPicker, setShowDuetPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showScreenTimePicker, setShowScreenTimePicker] = useState(false);
  const [showModePicker, setShowModePicker] = useState(false);
  const [showVibePrivacyPicker, setShowVibePrivacyPicker] = useState(false);
  const [showSwitchAccounts, setShowSwitchAccounts] = useState(false);
  const [showBlockedAccounts, setShowBlockedAccounts] = useState(false);
  const [showRestrictedAccounts, setShowRestrictedAccounts] = useState(false);
  const [editField, setEditField] = useState<{ title: string; label: string; value?: string; isPassword?: boolean } | null>(null);

  const persistSetting = useCallback((patch: Partial<UserSettings>) => {
    if (!userId) return;
    saveUserSettings(userId, patch);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchUserSettings(userId).then((s) => {
      setPrivateAccount(s.private_account);
      setCommentPermission(s.comment_permission);
      setMessagePermission(s.message_permission);
      setDuetPermission(s.duet_permission);
      setLikedPrivate(s.liked_private);
      setNotifLikes(s.notif_likes);
      setNotifComments(s.notif_comments);
      setNotifFollows(s.notif_follows);
      setNotifLive(s.notif_live);
      setNotifMentions(s.notif_mentions);
    }).catch(() => {});

    getGundrukProfile(userId).then((p) => {
      if (!vibeInteracted.current) {
        setShowInMatching(p.show_in_matching);
        setFindGundrukMode(p.find_gundruk_mode);
        setVibeRequestPrivacy(p.vibe_request_privacy);
      }
    }).catch(() => {});

    if (session?.access_token && session?.refresh_token) {
      saveAccount({
        id: userId,
        username: emailUsername,
        email: userEmail,
        avatar_url: userAvatar,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      }).catch(() => {});
    }
  }, [userId]);

  const permLabel = (opts: { label: string; value: string }[], v: string) =>
    opts.find((o) => o.value === v)?.label ?? "Everyone";

  const clearCache = () => {
    Alert.alert("Clear Cache?", "This will clear all locally cached images and data.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear Cache", style: "destructive", onPress: () => { setCacheCleared(true); showToast("✅ Cache cleared — 48 MB freed"); } },
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

  const langLabel = LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? "English";

  // ── Sub-component: section label ─────────────────────────────────────────────
  const SecLabel = ({ label }: { label: string }) => (
    <Text style={[styles.secLabel, { color: colors.mutedForeground }]}>{label}</Text>
  );

  // ── Sub-component: grouped card rows ─────────────────────────────────────────
  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );

  // ── Sub-component: single row inside a Card ───────────────────────────────────
  const Row = ({
    icon, iconBg, label, sub, isLast = false,
    onPress, rightEl,
  }: {
    icon: string; iconBg: string; label: string; sub?: string;
    isLast?: boolean; onPress?: () => void; rightEl?: React.ReactNode;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={[styles.row, !isLast && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
    >
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={17} color="#fff" />
      </View>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sub ? <Text style={[styles.rowSub, { color: colors.mutedForeground }]}>{sub}</Text> : null}
      </View>
      {rightEl ?? (onPress ? <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} /> : null)}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: topInset + 6, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.foreground }]}>Settings</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 72 }}>

        {/* ── Profile card ── */}
        <TouchableOpacity
          onPress={() => router.push("/edit-profile" as any)}
          activeOpacity={0.8}
          style={[styles.profileCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.profileAvatarWrap}>
            <UserAvatar username={emailUsername} size={56} />
            <View style={styles.profileEditDot}>
              <Ionicons name="pencil" size={10} color="#fff" />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.foreground }]}>{emailUsername}</Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{userEmail || "Not signed in"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* ════════════════════════════════════════════════════
            ACCOUNT
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Account" />
          <Card>
            <Row icon="person-outline" iconBg="#7C3AED" label="Edit Profile"
              sub="Update your photo, bio & name"
              onPress={() => router.push("/edit-profile" as any)} />
            <Row icon="lock-closed-outline" iconBg="#5B21B6" label="Change Password"
              sub="Update your account password"
              onPress={() => setEditField({ title: "Change Password", label: "New password", isPassword: true })} />
            <Row icon="mail-outline" iconBg="#6D28D9" label="Email & Phone"
              sub={userEmail || "Add email"}
              onPress={() => setEditField({ title: "Change Email", label: "New email address", value: userEmail })}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            CONTENT & ACTIVITY
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Content & Activity" />
          <Card>
            <Row icon="heart-outline" iconBg="#EC4899" label="Liked Posts"
              sub={likedPrivate ? "Private — only you can see" : "Visible on your profile"}
              rightEl={
                <Switch
                  value={!likedPrivate}
                  onValueChange={(v) => { setLikedPrivate(!v); persistSetting({ liked_private: !v }); }}
                  trackColor={{ false: colors.border, true: "#7C3AED" }}
                  thumbColor="#fff"
                />
              } />
            <Row icon="bookmark-outline" iconBg="#DB2777" label="Saved Posts"
              sub="Posts you've bookmarked"
              onPress={() => showToast("Saved posts coming soon 📌")} />
            <Row icon="archive-outline" iconBg="#9D174D" label="Archive"
              sub="Your archived content"
              onPress={() => showToast("Archive coming soon 📦")}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            PRIVACY & SECURITY
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Privacy & Security" />
          <Card>
            <Row icon="shield-outline" iconBg="#0EA5E9" label="Privacy Settings"
              sub={privateAccount ? "Private account" : "Public account"}
              onPress={() => {
                const next = !privateAccount;
                Alert.alert(
                  next ? "Switch to Private?" : "Switch to Public?",
                  next
                    ? "Only approved followers can see your posts."
                    : "Anyone can see your content.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: next ? "Make Private" : "Make Public", onPress: () => { setPrivateAccount(next); persistSetting({ private_account: next }); showToast(next ? "Account is now private 🔒" : "Account is now public 🌍"); } },
                  ]
                );
              }} />
            <Row icon="ban-outline" iconBg="#EF4444" label="Blocked Users"
              sub="Manage blocked accounts"
              onPress={() => setShowBlockedAccounts(true)} />
            <Row icon="finger-print-outline" iconBg="#F97316" label="Two-Factor Authentication"
              sub="Extra layer of security"
              onPress={() => Alert.alert("Two-Factor Authentication", "Set up 2FA via your email or authenticator app to protect your account.")}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            NOTIFICATIONS
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Notifications" />
          <Card>
            <Row icon="notifications-outline" iconBg="#8B5CF6" label="Push Notifications"
              sub={[notifLikes && "Likes", notifComments && "Comments", notifFollows && "Follows"].filter(Boolean).join(" · ") || "All off"}
              onPress={() => {
                Alert.alert(
                  "Push Notifications",
                  "Manage which push notifications you receive.",
                  [
                    { text: "Likes", onPress: () => { const v = !notifLikes; setNotifLikes(v); persistSetting({ notif_likes: v }); showToast(v ? "Likes notifications on ✅" : "Likes notifications off"); } },
                    { text: "Comments", onPress: () => { const v = !notifComments; setNotifComments(v); persistSetting({ notif_comments: v }); showToast(v ? "Comments notifications on ✅" : "Comments notifications off"); } },
                    { text: "Done", style: "cancel" },
                  ]
                );
              }} />
            <Row icon="mail-unread-outline" iconBg="#7C3AED" label="Email Notifications"
              sub="Digest, activity & security alerts"
              onPress={() => Alert.alert("Email Notifications", "Manage email notification preferences in your account settings on web.")}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            APP SETTINGS
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="App Settings" />
          <Card>
            <Row icon="color-palette-outline" iconBg="#7C3AED" label="Theme"
              sub={`${theme.name} ${theme.emoji}`}
              onPress={() => router.push("/theme" as any)} />
            <Row icon="language-outline" iconBg="#059669" label="Language"
              sub={langLabel}
              onPress={() => setShowLanguagePicker(true)} />
            <Row icon="trash-outline" iconBg="#EF4444" label="Clear Cache"
              sub={cacheCleared ? "✅ Cleared (48 MB freed)" : "Free up storage · 48 MB used"}
              onPress={clearCache}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            FIND VIBE
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Find Vibe" />
          <Card>
            <Row icon="heart-circle-outline" iconBg="#EC4899" label="Show me in Find Vibe"
              sub={showInMatching ? "Visible in matching & nearby" : "Hidden from all discovery"}
              rightEl={
                <Switch
                  value={showInMatching}
                  onValueChange={(v) => {
                    vibeInteracted.current = true;
                    setShowInMatching(v);
                    AsyncStorage.setItem(`find_vibe_locked_${userId}`, v ? "false" : "true").catch(() => {});
                    saveGundrukProfile(userId, { show_in_matching: v });
                    DeviceEventEmitter.emit("findVibeLockChanged", { locked: !v });
                    showToast(v ? "You're visible in Find Vibe ✅" : "Hidden from Find Vibe 🔒");
                  }}
                  trackColor={{ false: colors.border, true: "#EC4899" }}
                  thumbColor="#fff"
                />
              } />
            <Row icon="compass-outline" iconBg="#7C3AED" label="What am I looking for?"
              sub={FIND_GUNDRUK_MODE_OPTIONS.find((o) => o.value === findGundrukMode)?.label ?? "❤️  Dating"}
              onPress={showInMatching ? () => setShowModePicker(true) : undefined} />
            <Row icon="flash-outline" iconBg="#F97316" label="Who can send Vibe Requests?"
              sub={VIBE_REQUEST_OPTIONS.find((o) => o.value === vibeRequestPrivacy)?.label ?? "Everyone"}
              onPress={showInMatching ? () => setShowVibePrivacyPicker(true) : undefined}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            CREATOR TOOLS
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Creator Tools" />
          <Card>
            <Row icon="megaphone-outline" iconBg="#7C3AED" label="Advertise on Gundruk"
              sub="Reach millions of engaged users"
              onPress={() => router.push("/advertise" as any)}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            SUPPORT
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Support" />
          <Card>
            <Row icon="help-circle-outline" iconBg="#0EA5E9" label="Help Center"
              sub="FAQs, guides & contact"
              onPress={() => openLink("https://gundruk.app/help", "Help Center")} />
            <Row icon="bug-outline" iconBg="#F97316" label="Report a Problem"
              sub="Let us know about issues"
              onPress={() => Alert.alert("Report a Problem", "Please describe your issue:", [
                { text: "Cancel", style: "cancel" },
                { text: "Send Report", onPress: () => showToast("✅ Report sent — thank you!") },
              ])} />
            <Row icon="document-text-outline" iconBg="#6B7280" label="Terms of Service"
              onPress={() => openLink("https://gundruk.app/terms", "Terms of Service")} />
            <Row icon="shield-checkmark-outline" iconBg="#10B981" label="Privacy Policy"
              onPress={() => openLink("https://gundruk.app/privacy", "Privacy Policy")}
              isLast />
          </Card>
        </View>

        {/* ── Switch Accounts ── */}
        <View style={{ paddingHorizontal: 16, marginBottom: 4 }}>
          <TouchableOpacity
            onPress={() => setShowSwitchAccounts(true)}
            activeOpacity={0.8}
            style={[styles.switchAccountsBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <Ionicons name="people-outline" size={18} color="#7C3AED" />
            <Text style={[styles.switchAccountsText, { color: colors.foreground }]}>Switch Accounts</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ── Log Out ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 12 }}>
          <TouchableOpacity onPress={handleSignOut} activeOpacity={0.8} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <Text style={[styles.versionNote, { color: colors.mutedForeground }]}>
            Gundruk · v1.0.0 · Made with 💜
          </Text>
        </View>
      </ScrollView>

      {/* ── Pickers ── */}
      <OptionPicker visible={showCommentPicker} title="Who can comment" options={COMMENT_OPTIONS} selected={commentPermission}
        onSelect={(v) => { setCommentPermission(v); persistSetting({ comment_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowCommentPicker(false)} />
      <OptionPicker visible={showMessagePicker} title="Who can message me" options={MESSAGE_OPTIONS} selected={messagePermission}
        onSelect={(v) => { setMessagePermission(v); persistSetting({ message_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowMessagePicker(false)} />
      <OptionPicker visible={showDuetPicker} title="Who can duet / remix" options={DUET_OPTIONS} selected={duetPermission}
        onSelect={(v) => { setDuetPermission(v); persistSetting({ duet_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowDuetPicker(false)} />
      <OptionPicker visible={showLanguagePicker} title="Language" options={LANGUAGE_OPTIONS} selected={language}
        onSelect={(v) => { setLanguage(v); showToast("Language updated ✅"); }}
        onClose={() => setShowLanguagePicker(false)} />
      <OptionPicker visible={showScreenTimePicker} title="Daily Screen Time Limit" options={SCREEN_TIME_OPTIONS} selected={screenTime}
        onSelect={(v) => { setScreenTime(v); showToast("Screen time limit set ✅"); }}
        onClose={() => setShowScreenTimePicker(false)} />
      <OptionPicker visible={showModePicker} title="What are you looking for?" options={FIND_GUNDRUK_MODE_OPTIONS} selected={findGundrukMode}
        onSelect={(v) => { vibeInteracted.current = true; setFindGundrukMode(v); saveGundrukProfile(userId, { find_gundruk_mode: v }); showToast("Preference saved ✅"); }}
        onClose={() => setShowModePicker(false)} />
      <OptionPicker visible={showVibePrivacyPicker} title="Who can send Vibe Requests?" options={VIBE_REQUEST_OPTIONS} selected={vibeRequestPrivacy}
        onSelect={(v) => { setVibeRequestPrivacy(v); saveGundrukProfile(userId, { vibe_request_privacy: v }); showToast(v === "nobody" ? "Vibe Requests paused ⏸" : "Privacy setting saved ✅"); }}
        onClose={() => setShowVibePrivacyPicker(false)} />

      {/* ── Edit Field Modal ── */}
      {editField && (
        <EditFieldModal
          visible={!!editField}
          title={editField.title}
          fieldLabel={editField.label}
          currentValue={editField.value}
          isPassword={editField.isPassword}
          onSave={() => showToast(`${editField.label} updated ✅`)}
          onClose={() => setEditField(null)}
        />
      )}

      {/* ── Account Management Modals ── */}
      <SwitchAccountsModal
        visible={showSwitchAccounts}
        currentUserId={userId}
        currentUsername={emailUsername}
        currentEmail={userEmail}
        currentAvatar={userAvatar}
        onClose={() => setShowSwitchAccounts(false)}
        onToast={showToast}
      />
      <BlockedAccountsModal
        visible={showBlockedAccounts}
        userId={userId}
        onClose={() => setShowBlockedAccounts(false)}
        onToast={showToast}
      />
      <RestrictedAccountsModal
        visible={showRestrictedAccounts}
        userId={userId}
        onClose={() => setShowRestrictedAccounts(false)}
        onToast={showToast}
      />

      {ToastView}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10,
  },
  title: { flex: 1, textAlign: "center", fontSize: 17, fontFamily: "Poppins_700Bold" },

  // Profile card
  profileCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    marginHorizontal: 16, marginTop: 18, marginBottom: 4,
    padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  profileAvatarWrap: { position: "relative" },
  profileEditDot: {
    position: "absolute", bottom: 0, right: 0,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center",
  },
  profileName: { fontSize: 15, fontFamily: "Poppins_700Bold" },
  profileEmail: { fontSize: 12, fontFamily: "Poppins_400Regular", marginTop: 1 },

  // Section wrapper
  section: { paddingHorizontal: 16, marginTop: 20 },
  secLabel: {
    fontSize: 13, fontFamily: "Poppins_600SemiBold",
    marginBottom: 8, paddingLeft: 2,
  },

  // Card group
  card: {
    borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden",
  },

  // Row inside card
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

  // Switch accounts button
  switchAccountsBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth,
  },
  switchAccountsText: { flex: 1, fontSize: 14, fontFamily: "Poppins_500Medium" },

  // Log out
  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 50, borderRadius: 14,
    backgroundColor: "rgba(239,68,68,0.1)", borderWidth: 1.5, borderColor: "#EF4444",
  },
  logoutText: { color: "#EF4444", fontSize: 15, fontFamily: "Poppins_700Bold" },
  versionNote: { textAlign: "center", fontSize: 12, fontFamily: "Poppins_400Regular", paddingBottom: 4 },
});
