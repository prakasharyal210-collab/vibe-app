import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as FileSystem from "expo-file-system/legacy";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { callAI } from "@/lib/ai";

import { ALL_STATUSES, getStatusConfig } from "@/components/RelationshipStatusBadge";
import { ALL_ZODIAC_SIGNS, getZodiacSymbol } from "@/components/ZodiacSignBadge";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
const LOAD_TIMEOUT_MS = 8000;

const PRONOUNS = ["he/him", "she/her", "they/them", "he/they", "she/they", "any/all", "prefer not to say"];

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [showPronouns, setShowPronouns] = useState(false);
  const [relationshipStatus, setRelationshipStatus] = useState("");
  const [showRelStatus, setShowRelStatus] = useState(false);
  const [zodiacSign, setZodiacSign] = useState("");
  const [showZodiac, setShowZodiac] = useState(false);
  const [writingBio, setWritingBio] = useState(false);
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!session?.user?.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError(null);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

    try {
      const res = await fetch(`${API_BASE}/users/profile/by-id/${encodeURIComponent(session.user.id)}`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }

      const { profile } = await res.json() as { profile: Record<string, any> };
      setAvatarUrl(profile.avatar_url ?? null);
      setFullName(profile.full_name ?? "");
      setUsername(profile.username ?? "");
      setBio(profile.bio ?? "");
      setWebsite(profile.website ?? "");
      setLocation(profile.location ?? "");
      setPronouns(profile.pronouns ?? "");
      setRelationshipStatus(profile.relationship_status ?? "");
      setZodiacSign(profile.zodiac_sign ?? "");
    } catch (e: any) {
      clearTimeout(timer);
      const msg = e?.name === "AbortError"
        ? "Request timed out. Please check your connection."
        : (e?.message ?? "Could not load profile.");
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!res.canceled && res.assets[0]) {
      setAvatarUrl(res.assets[0].uri);
      setLocalAvatarUri(res.assets[0].uri);
    }
  };

  const uploadAvatar = async (userId: string, uri: string): Promise<string> => {
    const mimeType = uri.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    // Read as base64 via expo-file-system — avoids "Network request failed" on Android
    // where fetch() cannot handle content:// or file:// URIs from ImagePicker.
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: "base64" as any,
    });
    const res = await fetch(`${API_BASE}/storage/avatar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64, userId, mimeType }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as any).error ?? `Upload failed (HTTP ${res.status})`);
    }
    const { url } = await res.json() as { url: string };
    return url;
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    if (!username.trim()) { Alert.alert("Username required", "Please enter a username."); return; }
    setSaving(true);
    try {
      let savedAvatarUrl = avatarUrl;

      // Upload new avatar to Supabase Storage if user picked a new image.
      // Storage uses its own auth and does not hang under RLS.
      if (localAvatarUri) {
        savedAvatarUrl = await uploadAvatar(session.user.id, localAvatarUri);
        setAvatarUrl(savedAvatarUrl);
        setLocalAvatarUri(null);
      }

      // Save all profile fields via the API server (service role key bypasses RLS).
      const res = await fetch(`${API_BASE}/users/profile/${encodeURIComponent(session.user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim() || null,
          username: username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
          bio: bio.trim() || null,
          website: website.trim() || null,
          location: location.trim() || null,
          pronouns: pronouns || null,
          relationship_status: relationshipStatus || null,
          zodiac_sign: zodiacSign || null,
          avatar_url: savedAvatarUrl ?? null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `HTTP ${res.status}`);
      }

      Alert.alert("Saved!", "Your profile has been updated.", [{ text: "Done", onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
        <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Loading profile…</Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, paddingHorizontal: 32 }]}>
        <Ionicons name="cloud-offline-outline" size={48} color={colors.mutedForeground} style={{ marginBottom: 16 }} />
        <Text style={[styles.errorTitle, { color: colors.foreground }]}>Couldn't load profile</Text>
        <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>{loadError}</Text>
        <TouchableOpacity onPress={loadProfile} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()} style={[styles.retryBtn, { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border, marginTop: 10 }]}>
          <Text style={[styles.retryText, { color: colors.foreground }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.header, { paddingTop: topPad, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Edit Profile</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={saving}>
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.saveText}>Save</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={pickAvatar} style={styles.avatarWrap} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={[styles.avatarPlaceholder, { backgroundColor: "#7C3AED" }]}>
                <Text style={styles.avatarInitial}>{username?.[0]?.toUpperCase() ?? "?"}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={14} color="#fff" />
            </View>
          </TouchableOpacity>
          <Text style={styles.changePhoto}>Change profile photo</Text>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.form}>
          <Field label="Full name" value={fullName} onChange={setFullName} placeholder="Your display name" colors={colors} />
          <Field label="Username" value={username} onChange={setUsername} placeholder="username" autoCapitalize="none" colors={colors}>
            <Text style={[styles.hint, { color: colors.mutedForeground }]}>vibe.app/@{username || "username"}</Text>
          </Field>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Bio</Text>
            <View style={[styles.textAreaBox, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              <TextInput
                value={bio}
                onChangeText={(t) => setBio(t.slice(0, 150))}
                placeholder="Write something about yourself..."
                placeholderTextColor={colors.mutedForeground}
                style={[styles.textArea, { color: colors.foreground }]}
                multiline
              />
            </View>
            <Text style={[styles.charCount, { color: colors.mutedForeground }]}>{bio.length}/150</Text>
            <TouchableOpacity
              onPress={async () => {
                setWritingBio(true);
                const result = await callAI("bio_writer", { fullName, username });
                setWritingBio(false);
                if (result) setBio(result.replace(/^["']|["']$/g, "").slice(0, 150));
              }}
              disabled={writingBio}
              style={{ marginTop: 8, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(124,58,237,0.15)", borderWidth: 1, borderColor: "rgba(124,58,237,0.4)" }}
            >
              {writingBio
                ? <ActivityIndicator size="small" color="#A78BFA" />
                : <Text style={{ color: "#A78BFA", fontFamily: "Poppins_600SemiBold", fontSize: 13 }}>✨ Write My Bio</Text>}
            </TouchableOpacity>
          </View>

          <Field label="Website" value={website} onChange={setWebsite} placeholder="https://" autoCapitalize="none" keyboardType="url" colors={colors} />
          <Field label="Location" value={location} onChange={setLocation} placeholder="City, Country" colors={colors} />

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Pronouns</Text>
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowPronouns((v) => !v)}
            >
              <Text style={[styles.selectText, { color: pronouns ? colors.foreground : colors.mutedForeground }]}>
                {pronouns || "Select pronouns"}
              </Text>
              <Ionicons name={showPronouns ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {showPronouns && (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {PRONOUNS.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={[styles.dropdownRow, { borderBottomColor: colors.border }]}
                    onPress={() => { setPronouns(p); setShowPronouns(false); }}
                  >
                    <Text style={[styles.dropdownText, { color: colors.foreground }]}>{p}</Text>
                    {pronouns === p && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Relationship Status</Text>
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowRelStatus((v) => !v)}
            >
              {relationshipStatus ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>{getStatusConfig(relationshipStatus)?.emoji}</Text>
                  <Text style={[styles.selectText, { color: colors.foreground }]}>{relationshipStatus}</Text>
                </View>
              ) : (
                <Text style={[styles.selectText, { color: colors.mutedForeground }]}>Select status (optional)</Text>
              )}
              <Ionicons name={showRelStatus ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {showRelStatus && (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {ALL_STATUSES.map((s) => {
                  const cfg = getStatusConfig(s);
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.dropdownRow, { borderBottomColor: colors.border }]}
                      onPress={() => { setRelationshipStatus(s); setShowRelStatus(false); }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <Text style={{ fontSize: 16 }}>{cfg?.emoji}</Text>
                        <Text style={[styles.dropdownText, { color: colors.foreground }]}>{s}</Text>
                      </View>
                      {relationshipStatus === s && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  style={[styles.dropdownRow, { borderBottomColor: "transparent" }]}
                  onPress={() => { setRelationshipStatus(""); setShowRelStatus(false); }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontSize: 16 }}>🚫</Text>
                    <Text style={[styles.dropdownText, { color: colors.mutedForeground }]}>Prefer not to say</Text>
                  </View>
                  {!relationshipStatus && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={styles.fieldWrap}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Zodiac Sign</Text>
            <TouchableOpacity
              style={[styles.select, { backgroundColor: colors.muted, borderColor: colors.border }]}
              onPress={() => setShowZodiac((v) => !v)}
            >
              {zodiacSign ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14 }}>{getZodiacSymbol(zodiacSign)}</Text>
                  <Text style={[styles.selectText, { color: colors.foreground }]}>{zodiacSign}</Text>
                </View>
              ) : (
                <Text style={[styles.selectText, { color: colors.mutedForeground }]}>Select sign (optional)</Text>
              )}
              <Ionicons name={showZodiac ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
            {showZodiac && (
              <View style={[styles.dropdown, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {ALL_ZODIAC_SIGNS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.dropdownRow, { borderBottomColor: colors.border }]}
                    onPress={() => { setZodiacSign(s); setShowZodiac(false); }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Text style={{ fontSize: 16 }}>{getZodiacSymbol(s)}</Text>
                      <Text style={[styles.dropdownText, { color: colors.foreground }]}>{s}</Text>
                    </View>
                    {zodiacSign === s && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.dropdownRow, { borderBottomColor: "transparent" }]}
                  onPress={() => { setZodiacSign(""); setShowZodiac(false); }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontSize: 16 }}>🚫</Text>
                    <Text style={[styles.dropdownText, { color: colors.mutedForeground }]}>Prefer not to say</Text>
                  </View>
                  {!zodiacSign && <Ionicons name="checkmark" size={16} color="#7C3AED" />}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, value, onChange, placeholder, autoCapitalize, keyboardType, colors, children,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  autoCapitalize?: "none" | "sentences"; keyboardType?: "url" | "default"; colors: any; children?: React.ReactNode;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground, backgroundColor: colors.muted, borderColor: colors.border }]}
        autoCapitalize={autoCapitalize ?? "sentences"}
        keyboardType={keyboardType ?? "default"}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 12, fontSize: 13, fontFamily: "Poppins_400Regular" },
  errorTitle: { fontSize: 17, fontFamily: "Poppins_700Bold", marginBottom: 8, textAlign: "center" },
  errorMsg: { fontSize: 13, fontFamily: "Poppins_400Regular", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  retryBtn: { backgroundColor: "#7C3AED", paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, alignItems: "center", minWidth: 160 },
  retryText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  headerBtn: { width: 40, height: 36, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontFamily: "Poppins_700Bold" },
  saveBtn: { paddingHorizontal: 18, paddingVertical: 7, backgroundColor: "#7C3AED", borderRadius: 10, minWidth: 64, alignItems: "center" },
  saveText: { color: "#fff", fontFamily: "Poppins_700Bold", fontSize: 14 },
  avatarSection: { alignItems: "center", paddingVertical: 28, gap: 10 },
  avatarWrap: { position: "relative" },
  avatarImg: { width: 92, height: 92, borderRadius: 46, borderWidth: 2.5, borderColor: "#7C3AED" },
  avatarPlaceholder: { width: 92, height: 92, borderRadius: 46, alignItems: "center", justifyContent: "center" },
  avatarInitial: { color: "#fff", fontSize: 38, fontFamily: "Poppins_700Bold" },
  cameraBadge: { position: "absolute", bottom: 0, right: 0, backgroundColor: "#7C3AED", borderRadius: 14, width: 28, height: 28, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#000" },
  changePhoto: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#7C3AED" },
  divider: { height: 0.5, marginBottom: 20 },
  form: { paddingHorizontal: 16 },
  fieldWrap: { marginBottom: 20 },
  label: { fontSize: 12, fontFamily: "Poppins_600SemiBold", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input: { height: 46, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 14, fontFamily: "Poppins_400Regular", fontSize: 14 },
  hint: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 4, marginLeft: 2 },
  textAreaBox: { borderRadius: 12, borderWidth: 0.5, padding: 12 },
  textArea: { fontFamily: "Poppins_400Regular", fontSize: 14, minHeight: 80, textAlignVertical: "top" },
  charCount: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "right", marginTop: 4 },
  select: { height: 46, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  dropdown: { borderRadius: 12, borderWidth: 0.5, overflow: "hidden", marginTop: 4 },
  dropdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 0.5 },
  dropdownText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
});
