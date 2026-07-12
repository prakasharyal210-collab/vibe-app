import { BASE_URL } from "@/lib/share";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image as ExpoImage } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
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
  getRestrictedUsers,
  saveUserSettings,
  unblockUser,
  unrestrictUser,
  UserSettings,
} from "@/lib/db";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { useCoupleStatus } from "@/context/CoupleContext";
import { CoupleLinkModal } from "@/components/CoupleLinkModal";

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
      // Race against a 20-second hard timeout so "Switching…" can never hang
      // forever. supabase.auth.setSession() makes a network round-trip to
      // validate / refresh the token; if that fetch stalls (expired token,
      // network hiccup, cold connection wakeup) the Promise never settles
      // without this guard. 20 s is generous enough for slow mobile networks.
      type SetSessionResult = Awaited<ReturnType<typeof supabase.auth.setSession>>;
      const result = await Promise.race<SetSessionResult>([
        supabase.auth.setSession({
          access_token: acc.access_token,
          refresh_token: acc.refresh_token,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 20_000),
        ),
      ]);

      if (result.error) {
        // warn (not error) — this is an expected / handled path; toast already informs the user
        console.warn("[account-switch] setSession error:", result.error.message);
        onToast(
          result.error.message?.includes("expired") ||
          result.error.message?.includes("invalid")
            ? `Session expired for @${acc.username} — please log in again`
            : `Failed to switch to @${acc.username}`,
        );
        return;
      }

      // Persist freshly-issued tokens so subsequent switches also work
      if (result.data?.session) {
        await saveAccount({
          ...acc,
          access_token: result.data.session.access_token,
          refresh_token: result.data.session.refresh_token,
        }).catch(() => {});
      }

      onToast(`Switched to @${acc.username} ✅`);
      onClose();
      router.replace("/(tabs)/" as any);
    } catch (err: any) {
      // warn (not error) — timeout is expected when tokens are stale or network is slow;
      // the toast below already guides the user to re-authenticate.
      console.warn("[account-switch] error:", err?.message ?? err);
      onToast(
        err?.message === "timeout"
          ? `Timed out switching to @${acc.username} — session may be expired. Tap "Add Account" to log in again.`
          : `Failed to switch to @${acc.username}`,
      );
    } finally {
      // Always unblock the UI — even if the Promise timed out
      setSwitching(null);
    }
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
                    {user.full_name && (
                      <Text style={[baStyles.displayName, { color: colors.mutedForeground }]}>{user.full_name}</Text>
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
                    {user.full_name && (
                      <Text style={[baStyles.displayName, { color: colors.mutedForeground }]}>{user.full_name}</Text>
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

// ─── AgeRangeModal ─────────────────────────────────────────────────────────────
// Note: AgeRangeModal is kept here in case it is needed in the future, but
// Find Vibe settings (age range, distance, etc.) now live in find-vibe-settings.tsx.

function AgeRangeModal({
  visible, minAge, maxAge, onSave, onClose,
}: {
  visible: boolean; minAge: number; maxAge: number;
  onSave: (min: number, max: number) => void; onClose: () => void;
}) {
  const colors = useColors();
  const [minVal, setMinVal] = useState(String(minAge));
  const [maxVal, setMaxVal] = useState(String(maxAge));
  useEffect(() => {
    if (visible) { setMinVal(String(minAge)); setMaxVal(String(maxAge)); }
  }, [visible, minAge, maxAge]);

  const handleSave = () => {
    const mn = Math.max(18, Math.min(98, parseInt(minVal, 10) || 18));
    const mx = Math.max(mn + 1, Math.min(99, parseInt(maxVal, 10) || 60));
    onSave(mn, mx);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={opStyles.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={[opStyles.sheet, { backgroundColor: colors.background }]}>
        <View style={[opStyles.handle, { backgroundColor: colors.border }]} />
        <Text style={[opStyles.title, { color: colors.foreground }]}>Age Range Preference</Text>
        <Text style={[armStyles.hint, { color: colors.mutedForeground }]}>
          Show profiles aged between these values
        </Text>
        <View style={armStyles.row}>
          <View style={armStyles.half}>
            <Text style={[armStyles.label, { color: colors.mutedForeground }]}>Min age</Text>
            <TextInput
              value={minVal} onChangeText={setMinVal} keyboardType="numeric"
              style={[armStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
          <Text style={[armStyles.dash, { color: colors.mutedForeground }]}>–</Text>
          <View style={armStyles.half}>
            <Text style={[armStyles.label, { color: colors.mutedForeground }]}>Max age</Text>
            <TextInput
              value={maxVal} onChangeText={setMaxVal} keyboardType="numeric"
              style={[armStyles.input, { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border }]}
            />
          </View>
        </View>
        <TouchableOpacity onPress={handleSave} style={[armStyles.saveBtn, { backgroundColor: "#7C3AED" }]}>
          <Text style={armStyles.saveTxt}>Save</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={[opStyles.cancelBtn, { backgroundColor: colors.muted }]}>
          <Text style={[opStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const armStyles = StyleSheet.create({
  hint:    { fontSize: 13, fontFamily: "Poppins_400Regular", marginTop: -4, marginBottom: 20 },
  row:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 24 },
  half:    { flex: 1 },
  label:   { fontSize: 12, fontFamily: "Poppins_500Medium", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  input:   { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 14, fontSize: 24, fontFamily: "Poppins_700Bold", borderWidth: 1, textAlign: "center" },
  dash:    { fontSize: 26, fontFamily: "Poppins_700Bold", paddingBottom: 2 },
  saveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  saveTxt: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
});

// ─── Module-scope sub-components (stable type reference fixes Ionicons remount) ─
// Defining Row/Card/SecLabel inside the component function creates a NEW function
// reference on every render → React unmounts + remounts them → Ionicons briefly
// loses its glyph while re-initialising. Moving them here fixes that permanently.


function SecLabel({ label }: { label: string }) {
  const colors = useColors();
  return <Text style={[styles.secLabel, { color: colors.mutedForeground }]}>{label}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function Row({
  icon, iconBg, label, sub, isLast = false, onPress, rightEl,
}: {
  icon: string; iconBg: string; label: string; sub?: string;
  isLast?: boolean; onPress?: () => void; rightEl?: React.ReactNode;
}) {
  const colors = useColors();
  return (
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
}

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
  const { coupleStatus, coupleId, partnerName, partnerAvatar, pendingSent, pendingReceived, refresh: refreshCouple } = useCoupleStatus();

  useFocusEffect(useCallback(() => { refreshCouple(); }, [refreshCouple]));

  const [showLinkModal, setShowLinkModal] = useState(false);

  const handleAcceptCouple = async (requestId: string) => {
    try {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";
      const res = await fetch(`${apiBase}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId: requestId, userId }),
      });
      const data = await res.json();
      if (data.error) { Alert.alert("Error", data.error); return; }
      refreshCouple();
      showToast("💑 You're now linked!");
    } catch { Alert.alert("Error", "Failed to accept request"); }
  };

  const handleDeclineCouple = async (requestId: string) => {
    try {
      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";
      await fetch(`${apiBase}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coupleId: requestId, userId }),
      });
      refreshCouple();
    } catch { Alert.alert("Error", "Failed to decline"); }
  };

  const handleCancelSentRequest = async () => {
    if (!pendingSent) return;
    Alert.alert("Cancel Request?", "Withdraw the couple request?", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel Request", style: "destructive", onPress: async () => {
          try {
            const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";
            await fetch(`${apiBase}/decline`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coupleId: pendingSent.id, userId }),
            });
            refreshCouple();
          } catch { Alert.alert("Error", "Failed to cancel"); }
        },
      },
    ]);
  };

  const [showRelationship, setShowRelationship] = useState(true);

  useEffect(() => {
    if (coupleStatus !== "coupled" || !userId) return;
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    fetch(`${apiBase}/users/profile/by-id/${userId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (d?.profile?.show_relationship !== undefined) {
          setShowRelationship(d.profile.show_relationship !== false);
        }
      })
      .catch(() => {});
  }, [coupleStatus, userId]);

  const handleShowRelationshipToggle = async (value: boolean) => {
    setShowRelationship(value);
    const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
    try {
      await fetch(`${apiBase}/users/profile/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_relationship: value }),
      });
    } catch { /* non-fatal */ }
  };

  const handleUnlink = () => {
    Alert.alert("Unlink Couple?", "This will remove your couple connection.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unlink", style: "destructive", onPress: async () => {
          if (!coupleId) return;
          try {
            const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api/couple";
            await fetch(`${apiBase}/unlink`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ coupleId, userId }),
            });
            refreshCouple();
          } catch { Alert.alert("Error", "Failed to unlink"); }
        },
      },
    ]);
  };

  // Settings state
  const [privateAccount, setPrivateAccount] = useState(false);
  const [commentPermission, setCommentPermission] = useState("everyone");
  const [messagePermission, setMessagePermission] = useState("everyone");
  const [duetPermission, setDuetPermission] = useState("everyone");
  const [likedPrivate, setLikedPrivate] = useState(false);
  const [restrictedMode, setRestrictedMode] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);
  const [language, setLanguage] = useState("en");
  const [screenTime, setScreenTime] = useState("none");

  // Picker / modal visibility
  const [showCommentPicker, setShowCommentPicker] = useState(false);
  const [showMessagePicker, setShowMessagePicker] = useState(false);
  const [showDuetPicker, setShowDuetPicker] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showScreenTimePicker, setShowScreenTimePicker] = useState(false);
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
      setCommentPermission(s.who_can_comment);
      setMessagePermission(s.who_can_message);
      setDuetPermission(s.duet_permission);
      setLikedPrivate(s.liked_private);
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

  // Keep stored tokens fresh — Supabase auto-refreshes the access_token every
  // ~55 min. Without this, saved tokens go stale and setSession() hangs/fails
  // when switching back to this account later.
  useEffect(() => {
    if (!userId) return;
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (
          (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") &&
          newSession?.user?.id === userId &&
          newSession.access_token &&
          newSession.refresh_token
        ) {
          saveAccount({
            id: userId,
            username: emailUsername,
            email: userEmail,
            avatar_url: userAvatar,
            access_token: newSession.access_token,
            refresh_token: newSession.refresh_token,
          }).catch(() => {});
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [userId, emailUsername, userEmail, userAvatar]);

  const permLabel = (opts: { label: string; value: string }[], v: string) =>
    opts.find((o) => o.value === v)?.label ?? "Everyone";

  const clearCache = () => {
    Alert.alert("Clear Cache?", "This will clear all locally cached images and data.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear Cache",
        style: "destructive",
        onPress: async () => {
          await Promise.all([
            ExpoImage.clearDiskCache(),
            ExpoImage.clearMemoryCache(),
          ]);
          setCacheCleared(true);
          showToast("Cache cleared");
        },
      },
    ]);
  };

  const handleSignOut = () => {
    Alert.alert("Log Out?", "You'll need to sign in again to access your account.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: signOut },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account?",
      "This will permanently delete your account, posts, and all data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Are you sure?",
              "Type your username to confirm permanent deletion.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Yes, delete everything",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
                      const res = await fetch(`${apiBase}/users/account`, {
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ userId }),
                      });
                      if (!res.ok) throw new Error("Failed");
                      await signOut();
                    } catch {
                      Alert.alert("Error", "Could not delete account. Please try again or contact support.");
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const openLink = (url: string, title: string) => {
    Linking.openURL(url).catch(() => Alert.alert(title, `Visit: ${url}`));
  };

  const langLabel = LANGUAGE_OPTIONS.find((o) => o.value === language)?.label ?? "English";

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
            RELATIONSHIP MODE
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Relationship Mode" />

          {/* ── Coupled ── */}
          {coupleStatus === "coupled" && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={relStyles.modeRow}>
                <LinearGradient colors={["rgba(236,72,153,0.2)", "rgba(236,72,153,0.05)"]} style={relStyles.modeCard}>
                  <Text style={{ fontSize: 28, marginBottom: 6 }}>💑</Text>
                  <Text style={[relStyles.modeLabel, { color: "#EC4899" }]}>In a Relationship</Text>
                  <View style={[relStyles.activeDot, { backgroundColor: "#EC4899" }]} />
                </LinearGradient>
              </View>
              <View style={[relStyles.partnerRow, { borderTopColor: colors.border }]}>
                {partnerAvatar ? (
                  <Image source={{ uri: partnerAvatar }} style={relStyles.partnerAvatar} />
                ) : (
                  <View style={[relStyles.partnerAvatar, relStyles.partnerAvatarFallback]}>
                    <Text style={{ fontSize: 18 }}>👤</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={[relStyles.partnerName, { color: colors.foreground }]}>{partnerName ?? "Your partner"}</Text>
                  <Text style={[relStyles.partnerSub, { color: colors.mutedForeground }]}>Linked partner · Couple tab active</Text>
                </View>
                <TouchableOpacity onPress={handleUnlink} style={relStyles.unlinkBtn}>
                  <Text style={relStyles.unlinkText}>Unlink</Text>
                </TouchableOpacity>
              </View>
              <View style={[relStyles.toggleRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[relStyles.toggleLabel, { color: colors.foreground }]}>Show on profile</Text>
                  <Text style={[relStyles.toggleSub, { color: colors.mutedForeground }]}>Display partner badge publicly</Text>
                </View>
                <Switch
                  value={showRelationship}
                  onValueChange={handleShowRelationshipToggle}
                  trackColor={{ false: "rgba(255,255,255,0.1)", true: "rgba(236,72,153,0.5)" }}
                  thumbColor={showRelationship ? "#EC4899" : "rgba(255,255,255,0.6)"}
                />
              </View>
            </View>
          )}

          {/* ── Pending sent ── */}
          {coupleStatus === "pending_sent" && pendingSent && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={relStyles.pendingWrap}>
                <Text style={{ fontSize: 28, marginBottom: 10 }}>⏳</Text>
                <Text style={[relStyles.pendingTitle, { color: colors.foreground }]}>Request Sent</Text>
                {pendingSent.receiver && (
                  <Text style={[relStyles.pendingSub, { color: colors.mutedForeground }]}>
                    Waiting for @{pendingSent.receiver.username} to accept…
                  </Text>
                )}
                <TouchableOpacity onPress={handleCancelSentRequest} style={relStyles.cancelBtn}>
                  <Text style={relStyles.cancelText}>Cancel Request</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Pending received ── */}
          {coupleStatus === "pending_received" && pendingReceived.length > 0 && (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {pendingReceived.map((req, i) => (
                <View
                  key={req.id}
                  style={[relStyles.incomingRow, i < pendingReceived.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                >
                  {req.requester?.avatar_url ? (
                    <Image source={{ uri: req.requester.avatar_url }} style={relStyles.reqAvatar} />
                  ) : (
                    <View style={[relStyles.reqAvatar, relStyles.partnerAvatarFallback]}>
                      <Text style={{ fontSize: 16 }}>👤</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[relStyles.reqName, { color: colors.foreground }]}>
                      💕 {req.requester?.full_name || req.requester?.username || "Someone"} wants to link!
                    </Text>
                    <Text style={[relStyles.reqSub, { color: colors.mutedForeground }]}>@{req.requester?.username}</Text>
                  </View>
                  <View style={relStyles.reqActions}>
                    <TouchableOpacity onPress={() => handleAcceptCouple(req.id)} style={relStyles.acceptBtn}>
                      <LinearGradient colors={["#7C3AED", "#EC4899"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={relStyles.acceptGrad}>
                        <Text style={relStyles.acceptText}>Accept</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeclineCouple(req.id)} style={relStyles.declineBtn}>
                      <Text style={relStyles.declineText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ── None: two mode cards ── */}
          {coupleStatus === "none" && (
            <View style={relStyles.modeRow}>
              <TouchableOpacity activeOpacity={0.85} style={[relStyles.modeCard, relStyles.modeSingle, { backgroundColor: colors.card, borderColor: "#8B5CF6" }]}>
                <Text style={{ fontSize: 28, marginBottom: 6 }}>💫</Text>
                <Text style={[relStyles.modeLabel, { color: "#8B5CF6" }]}>Single</Text>
                <View style={[relStyles.activeDot, { backgroundColor: "#8B5CF6" }]} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowLinkModal(true)}
                activeOpacity={0.85}
                style={[relStyles.modeCard, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                <Text style={{ fontSize: 28, marginBottom: 6 }}>💑</Text>
                <Text style={[relStyles.modeLabel, { color: colors.mutedForeground }]}>In a Relationship</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

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
              sub={privateAccount ? "Private account · manage visibility & interactions" : "Public account · manage visibility & interactions"}
              onPress={() => router.push("/privacy-settings" as any)} />
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
            <Row icon="notifications-outline" iconBg="#8B5CF6" label="Notification Settings"
              sub="Push, in-app, interactions, messages & more"
              onPress={() => router.push("/notification-settings" as any)} />
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
            <Row
              icon="heart-circle-outline"
              iconBg="#EC4899"
              label="Find Vibe Settings"
              sub="Discovery, filters, vibe profile & more"
              onPress={() => router.push("/find-vibe-settings" as any)}
              isLast />
          </Card>
        </View>

        {/* ════════════════════════════════════════════════════
            CREATOR TOOLS
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Creator Tools" />
          <View style={{ opacity: 0.6 }}>
            <Card>
              <Row icon="megaphone-outline" iconBg="#7C3AED" label="Advertise on Gundruk"
                sub="Coming soon"
                onPress={() => Alert.alert("Coming soon 🚀", "Advertising is coming soon — stay tuned!")}
                rightEl={<Ionicons name="lock-closed-outline" size={16} color="#7C3AED" />}
                isLast />
            </Card>
          </View>
        </View>

        {/* ════════════════════════════════════════════════════
            ADMIN (only shown to admin accounts)
        ════════════════════════════════════════════════════ */}
        {["prakasharyal", "admin", "gundruk_admin"].includes(
          (emailUsername ?? "").toLowerCase(),
        ) && (
          <View style={styles.section}>
            <SecLabel label="Admin" />
            <Card>
              <Row
                icon="hand-left-outline"
                iconBg="#7C3AED"
                label="Welcome Desk"
                sub="Welcome new users' first posts"
                onPress={() => router.push("/admin/welcome-desk" as any)}
              />
              <Row
                icon="flag-outline"
                iconBg="#EF4444"
                label="Reports"
                sub="Review flagged content"
                onPress={() => router.push("/admin/reports" as any)}
                isLast
              />
            </Card>
          </View>
        )}

        {/* ════════════════════════════════════════════════════
            SUPPORT
        ════════════════════════════════════════════════════ */}
        <View style={styles.section}>
          <SecLabel label="Support" />
          <Card>
            <Row icon="help-circle-outline" iconBg="#0EA5E9" label="Help Center"
              sub="FAQs, guides & contact"
              onPress={() => openLink(`${BASE_URL}/help`, "Help Center")} />
            <Row icon="bug-outline" iconBg="#F97316" label="Report a Problem"
              sub="Let us know about issues"
              onPress={() => Alert.alert("Report a Problem", "Please describe your issue:", [
                { text: "Cancel", style: "cancel" },
                { text: "Send Report", onPress: () => showToast("✅ Report sent — thank you!") },
              ])} />
            <Row icon="document-text-outline" iconBg="#6B7280" label="Terms of Service"
              onPress={() => openLink(`${BASE_URL}/terms`, "Terms of Service")} />
            <Row icon="shield-checkmark-outline" iconBg="#10B981" label="Privacy Policy"
              onPress={() => openLink(`${BASE_URL}/privacy`, "Privacy Policy")}
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

        {/* ── Log Out + Delete Account ── */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
          <TouchableOpacity onPress={handleSignOut} activeOpacity={0.8} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color="#EF4444" />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDeleteAccount} activeOpacity={0.8} style={styles.deleteAccountBtn}>
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
            <Text style={styles.deleteAccountText}>Delete Account</Text>
          </TouchableOpacity>
          <Text style={[styles.versionNote, { color: colors.mutedForeground }]}>
            Gundruk · v1.0.0 · Made with 💜
          </Text>
        </View>
      </ScrollView>

      {/* ── Pickers ── */}
      <OptionPicker visible={showCommentPicker} title="Who can comment" options={COMMENT_OPTIONS} selected={commentPermission}
        onSelect={(v) => { setCommentPermission(v); persistSetting({ who_can_comment: v as any }); showToast("Saved ✅"); }}
        onClose={() => setShowCommentPicker(false)} />
      <OptionPicker visible={showMessagePicker} title="Who can message me" options={MESSAGE_OPTIONS} selected={messagePermission}
        onSelect={(v) => { setMessagePermission(v); persistSetting({ who_can_message: v as any }); showToast("Saved ✅"); }}
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
      <CoupleLinkModal
        visible={showLinkModal}
        userId={userId}
        onClose={() => setShowLinkModal(false)}
        onRequestSent={() => { setShowLinkModal(false); refreshCouple(); }}
      />
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
  deleteAccountBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 44, borderRadius: 14,
    backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(239,68,68,0.35)",
  },
  deleteAccountText: { color: "#EF4444", fontSize: 13, fontFamily: "Poppins_500Medium" },
  versionNote: { textAlign: "center", fontSize: 12, fontFamily: "Poppins_400Regular", paddingBottom: 4 },
});

const relStyles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: 10, padding: 12 },
  modeCard: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
    gap: 2,
  },
  modeSingle: { borderColor: "#8B5CF6" },
  modeLabel: { fontFamily: "Poppins_700Bold", fontSize: 13, textAlign: "center" },
  activeDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  partnerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  partnerAvatar: { width: 44, height: 44, borderRadius: 22 },
  partnerAvatarFallback: { backgroundColor: "rgba(139,92,246,0.2)", alignItems: "center", justifyContent: "center" },
  partnerName: { fontFamily: "Poppins_700Bold", fontSize: 15 },
  partnerSub: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  unlinkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  unlinkText: { color: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 12 },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { fontFamily: "Poppins_600SemiBold", fontSize: 14 },
  toggleSub: { fontFamily: "Poppins_400Regular", fontSize: 12, marginTop: 1 },
  pendingWrap: { alignItems: "center", padding: 20 },
  pendingTitle: { fontFamily: "Poppins_700Bold", fontSize: 17, marginBottom: 6 },
  pendingSub: { fontFamily: "Poppins_400Regular", fontSize: 13, textAlign: "center", marginBottom: 16 },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.4)",
  },
  cancelText: { color: "#EF4444", fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  incomingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
  reqAvatar: { width: 40, height: 40, borderRadius: 20 },
  reqName: { fontFamily: "Poppins_600SemiBold", fontSize: 13 },
  reqSub: { fontFamily: "Poppins_400Regular", fontSize: 11, marginTop: 1 },
  reqActions: { gap: 6 },
  acceptBtn: { borderRadius: 10, overflow: "hidden" },
  acceptGrad: { paddingHorizontal: 14, paddingVertical: 7 },
  acceptText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 12 },
  declineBtn: { paddingHorizontal: 14, paddingVertical: 7, alignItems: "center" },
  declineText: { color: "rgba(255,255,255,0.35)", fontFamily: "Poppins_500Medium", fontSize: 12 },
});
