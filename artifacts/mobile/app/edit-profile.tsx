import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
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
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";

const PRONOUNS = ["he/him", "she/her", "they/them", "he/they", "she/they", "any/all", "prefer not to say"];

export default function EditProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topPad = Platform.OS === "web" ? 16 : insets.top + 4;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [pronouns, setPronouns] = useState("");
  const [showPronouns, setShowPronouns] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) { setLoading(false); return; }
    supabase.from("profiles").select("*").eq("id", session.user.id).single()
      .then(({ data }) => {
        if (data) {
          setAvatarUrl((data as any).avatar_url ?? null);
          setFullName((data as any).full_name ?? "");
          setUsername((data as any).username ?? "");
          setBio((data as any).bio ?? "");
          setWebsite((data as any).website ?? "");
          setLocation((data as any).location ?? "");
          setPronouns((data as any).pronouns ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [session?.user?.id]);

  // Tracks whether the user picked a new local image that needs uploading
  const [localAvatarUri, setLocalAvatarUri] = useState<string | null>(null);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
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
    const ext = uri.split(".").pop()?.split("?")[0] || "jpg";
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const path = `${userId}/avatar.${ext}`;

    const response = await fetch(uri);
    const blob = await response.blob();

    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, contentType });
    if (error) throw error;

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // Bust cache so the new image loads immediately
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    if (!username.trim()) { Alert.alert("Username required", "Please enter a username."); return; }
    setSaving(true);
    try {
      let savedAvatarUrl = avatarUrl;

      // Upload new avatar to Supabase Storage if user picked a new image
      if (localAvatarUri) {
        savedAvatarUrl = await uploadAvatar(session.user.id, localAvatarUri);
        setAvatarUrl(savedAvatarUrl);
        setLocalAvatarUri(null);
      }

      const { error } = await supabase.from("profiles").update({
        full_name: fullName.trim() || null,
        username: username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, ""),
        bio: bio.trim() || null,
        website: website.trim() || null,
        location: location.trim() || null,
        pronouns: pronouns || null,
        avatar_url: savedAvatarUrl ?? null,
      }).eq("id", session.user.id);
      if (error) throw error;
      Alert.alert("Saved!", "Your profile has been updated.", [{ text: "Done", onPress: () => router.back() }]);
    } catch {
      Alert.alert("Error", "Could not save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color="#7C3AED" size="large" />
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
