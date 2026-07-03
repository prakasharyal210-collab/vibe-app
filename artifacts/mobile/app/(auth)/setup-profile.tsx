import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GradientButton } from "@/components/GradientButton";
import { GundrukLogo } from "@/components/GundrukLogo";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import { ensureUserSetup } from "@/lib/db";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SetupProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session, clearNeedsOnboarding } = useAuth();

  const [username, setUsername] = useState("");
  const [status, setStatus] = useState<UsernameStatus>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pre-fill from OAuth provider metadata if available
  const meta = session?.user?.user_metadata ?? {};
  const suggestedName: string =
    meta["preferred_username"] ?? meta["user_name"] ?? "";

  useEffect(() => {
    if (suggestedName && !username) {
      setUsername(suggestedName.replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20));
    }
  }, [suggestedName]);

  // Debounced availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username) { setStatus("idle"); return; }
    setStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/users/check-username?username=${encodeURIComponent(username)}`,
        );
        const data = await res.json();
        if (data.reason === "invalid_format") setStatus("invalid");
        else setStatus(data.available ? "available" : "taken");
      } catch {
        setStatus("idle");
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  const handleSubmit = async () => {
    setError(null);
    if (!username) { setError("Please choose a username"); return; }
    if (status === "taken") { setError("That username is already taken — please choose another."); return; }
    if (status === "invalid") { setError("Username: 3–20 chars, letters, numbers, underscores only."); return; }
    if (status === "checking") { setError("Still checking username availability…"); return; }

    setLoading(true);
    try {
      const u = session!.user;
      await ensureUserSetup(u.id, username, u.email ?? undefined);
      clearNeedsOnboarding();
      router.replace("/(tabs)/feed");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const btnDisabled =
    loading ||
    status === "taken" ||
    status === "invalid" ||
    (username.length > 0 && status === "checking");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.content,
          {
            paddingTop: topInset + 48,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24,
          },
        ]}
      >
        <GundrukLogo subtitle="Almost there" />

        <View style={styles.card}>
          <Text style={styles.heading}>Choose your username</Text>
          <Text style={[styles.sub, { color: colors.mutedForeground }]}>
            This is how people will find you on Gundruk.
          </Text>

          <View style={{ gap: 4 }}>
            <TextInput
              value={username}
              onChangeText={v => { setUsername(v); setError(null); }}
              placeholder="Username"
              placeholderTextColor="rgba(156,163,175,0.55)"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[
                styles.input,
                focused && styles.inputFocused,
                status === "taken" && styles.inputError,
                status === "available" && styles.inputOk,
              ]}
            />
            {status === "checking" && (
              <View style={styles.feedbackRow}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                <Text style={[styles.hint, { color: "rgba(255,255,255,0.4)" }]}>Checking…</Text>
              </View>
            )}
            {status === "available" && (
              <Text style={[styles.hint, { color: "#22C55E" }]}>✅ Username available</Text>
            )}
            {status === "taken" && (
              <Text style={[styles.hint, { color: "#F87171" }]}>❌ Username already taken</Text>
            )}
            {status === "invalid" && (
              <Text style={[styles.hint, { color: "#FBBF24" }]}>
                ⚠️ 3–20 chars, letters, numbers, underscores only
              </Text>
            )}
          </View>

          {error != null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <GradientButton
            onPress={handleSubmit}
            title="Continue"
            loading={loading}
            disabled={btnDisabled}
            style={styles.btn}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },
  content: { flex: 1, paddingHorizontal: 24 },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    ...Platform.select({ web: { backdropFilter: "blur(20px)" } as any }),
  },
  heading: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  sub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 4,
  },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#fff",
  },
  inputFocused: {
    borderColor: "rgba(139,92,246,0.6)",
    backgroundColor: "rgba(139,92,246,0.06)",
  },
  inputError: {
    borderColor: "rgba(248,113,113,0.5)",
    backgroundColor: "rgba(248,113,113,0.05)",
  },
  inputOk: { borderColor: "rgba(34,197,94,0.4)" },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  hint: { fontSize: 12, fontFamily: "Poppins_400Regular", paddingLeft: 2 },
  errorBanner: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorText: { fontSize: 13, fontFamily: "Poppins_400Regular", color: "#FCA5A5", lineHeight: 20 },
  btn: { marginTop: 4 },
});
