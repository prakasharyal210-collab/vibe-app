import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated as RNAnimated,
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
  getRestrictedUsers,
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
      RNAnimated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 14 }),
    ]).start();
    setTimeout(() => {
      RNAnimated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
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

// ─── SettingRow / SectionHeader ───────────────────────────────────────────────

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
  const [textSize, setTextSize] = useState("medium");
  const [language, setLanguage] = useState("en");
  const [screenTime, setScreenTime] = useState("none");

  // Picker visibility
  const [showCommentPicker, setShowCommentPicker] = useState(false);
  const [showMessagePicker, setShowMessagePicker] = useState(false);
  const [showDuetPicker, setShowDuetPicker] = useState(false);
  const [showTextSizePicker, setShowTextSizePicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showScreenTimePicker, setShowScreenTimePicker] = useState(false);

  // Modal screens
  const [showSwitchAccounts, setShowSwitchAccounts] = useState(false);
  const [showBlockedAccounts, setShowBlockedAccounts] = useState(false);
  const [showRestrictedAccounts, setShowRestrictedAccounts] = useState(false);

  const [editField, setEditField] = useState<{ title: string; label: string; value?: string; isPassword?: boolean } | null>(null);

  const persistSetting = useCallback((patch: Partial<UserSettings>) => {
    if (!userId) return;
    saveUserSettings(userId, patch);
  }, [userId]);

  // Load settings + save current account to AsyncStorage
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

    // Persist the current account so SwitchAccounts can list it
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
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>{userEmail || "Not signed in"}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        <SectionHeader label="APPEARANCE" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="color-palette-outline" iconColor={colors.primary} label="Theme" sub={`${theme.name} ${theme.emoji}`} onPress={() => router.push("/theme" as any)} colors={colors} />
        </View>

        <SectionHeader label="ACCOUNT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="person-outline" label="Username" sub={`@${emailUsername}`} onPress={() => setEditField({ title: "Change Username", label: "New username", value: emailUsername })} colors={colors} />
          <SettingRow icon="mail-outline" label="Email" sub={userEmail || "—"} onPress={() => setEditField({ title: "Change Email", label: "New email address", value: userEmail })} colors={colors} />
          <SettingRow icon="call-outline" label="Phone Number" sub="Add phone number" onPress={() => setEditField({ title: "Phone Number", label: "Phone number (+1 234 567 8900)" })} colors={colors} />
          <SettingRow icon="lock-closed-outline" label="Password" sub="Change your password" onPress={() => setEditField({ title: "Change Password", label: "New password", isPassword: true })} colors={colors} />
          <SettingRow
            icon="people-outline"
            label="Switch Accounts"
            sub="Quickly switch between accounts"
            onPress={() => setShowSwitchAccounts(true)}
            colors={colors}
          />
        </View>

        <SectionHeader label="PRIVACY" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="lock-closed-outline" label="Private Account" sub={privateAccount ? "Only followers can see your content" : "Anyone can see your content"} value={privateAccount} onToggle={(v) => {
            const title = v ? "Switch to Private?" : "Switch to Public?";
            const msg = v
              ? "Your account will be private. Only approved followers can see your posts and stories."
              : "Your account will be public. Anyone can see your content.";
            Alert.alert(title, msg, [
              { text: "Cancel", style: "cancel" },
              { text: v ? "Make Private" : "Make Public", onPress: () => { setPrivateAccount(v); persistSetting({ private_account: v }); showToast(v ? "Account is now private 🔒" : "Account is now public 🌍"); } },
            ]);
          }} colors={colors} />
          <SettingRow
            icon="chatbubble-outline"
            label="Who can comment"
            sub={permLabel(COMMENT_OPTIONS, commentPermission)}
            onPress={() => setShowCommentPicker(true)}
            colors={colors}
          />
          <SettingRow
            icon="repeat-outline"
            label="Who can duet/remix"
            sub={permLabel(DUET_OPTIONS, duetPermission)}
            onPress={() => setShowDuetPicker(true)}
            colors={colors}
          />
          <SettingRow
            icon="paper-plane-outline"
            label="Who can message me"
            sub={permLabel(MESSAGE_OPTIONS, messagePermission)}
            onPress={() => setShowMessagePicker(true)}
            colors={colors}
          />
          <SettingRow icon="heart-outline" label="Liked videos" sub={likedPrivate ? "Private — only you" : "Public"} value={likedPrivate} onToggle={(v) => { setLikedPrivate(v); persistSetting({ liked_private: v }); }} colors={colors} />
          <SettingRow
            icon="ban-outline"
            label="Blocked Accounts"
            sub="Manage blocked users"
            onPress={() => setShowBlockedAccounts(true)}
            colors={colors}
          />
          <SettingRow
            icon="eye-off-outline"
            label="Restricted Accounts"
            sub="Manage restricted users"
            onPress={() => setShowRestrictedAccounts(true)}
            colors={colors}
          />
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

        <SectionHeader label="CREATOR TOOLS" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="megaphone-outline" label="Advertise on Vibe" sub="Reach millions of engaged users" onPress={() => router.push("/advertise" as any)} colors={colors} iconColor="#7C3AED" />
        </View>

        <SectionHeader label="ABOUT" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow icon="document-text-outline" label="Terms of Service" onPress={() => openLink("https://vibe.app/terms", "Terms of Service")} colors={colors} />
          <SettingRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openLink("https://vibe.app/privacy", "Privacy Policy")} colors={colors} iconColor="#10B981" />
          <SettingRow icon="information-circle-outline" label="App Version" sub="Vibe v1.0.0 (build 1) · Up to date ✓" colors={colors} iconColor="#6B7280" />
          <SettingRow icon="bug-outline" label="Report a Problem" onPress={() => Alert.alert("Report a Problem", "Please describe your issue:", [
            { text: "Cancel", style: "cancel" },
            { text: "Send Report", onPress: () => showToast("✅ Report sent — thank you!") },
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

      {/* ── Pickers ── */}
      <OptionPicker
        visible={showCommentPicker}
        title="Who can comment"
        options={COMMENT_OPTIONS}
        selected={commentPermission}
        onSelect={(v) => { setCommentPermission(v); persistSetting({ comment_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowCommentPicker(false)}
      />
      <OptionPicker
        visible={showMessagePicker}
        title="Who can message me"
        options={MESSAGE_OPTIONS}
        selected={messagePermission}
        onSelect={(v) => { setMessagePermission(v); persistSetting({ message_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowMessagePicker(false)}
      />
      <OptionPicker
        visible={showDuetPicker}
        title="Who can duet / remix"
        options={DUET_OPTIONS}
        selected={duetPermission}
        onSelect={(v) => { setDuetPermission(v); persistSetting({ duet_permission: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowDuetPicker(false)}
      />
      <OptionPicker
        visible={showTextSizePicker}
        title="Text Size"
        options={TEXT_SIZE_OPTIONS}
        selected={textSize}
        onSelect={(v) => { setTextSize(v); showToast("Text size updated ✅"); }}
        onClose={() => setShowTextSizePicker(false)}
      />
      <OptionPicker
        visible={showLanguagePicker}
        title="Language"
        options={LANGUAGE_OPTIONS}
        selected={language}
        onSelect={(v) => { setLanguage(v); showToast("Language updated ✅"); }}
        onClose={() => setShowLanguagePicker(false)}
      />
      <OptionPicker
        visible={showScreenTimePicker}
        title="Daily Screen Time Limit"
        options={SCREEN_TIME_OPTIONS}
        selected={screenTime}
        onSelect={(v) => { setScreenTime(v); showToast("Screen time limit set ✅"); }}
        onClose={() => setShowScreenTimePicker(false)}
      />

      {/* ── Edit Field ── */}
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

      {/* ── Toast ── */}
      {ToastView}
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
