import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GradientButton } from "@/components/GradientButton";
import { GundrukLogo } from "@/components/GundrukLogo";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<"username" | "email" | "password" | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username) { setUsernameStatus("idle"); return; }
    setUsernameStatus("checking");
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/users/check-username?username=${encodeURIComponent(username)}`
        );
        const data = await res.json();
        if (data.reason === "invalid_format") setUsernameStatus("invalid");
        else setUsernameStatus(data.available ? "available" : "taken");
      } catch {
        setUsernameStatus("idle");
      }
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username]);

  const handleSignup = async () => {
    if (!username || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }
    if (usernameStatus === "taken") {
      Alert.alert("Username Taken", "That username is already taken. Please choose another.");
      return;
    }
    if (usernameStatus === "invalid") {
      Alert.alert("Invalid Username", "3–20 characters, letters, numbers, underscores only.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    setLoading(false);
    if (error) {
      Alert.alert("Sign Up Failed", error.message);
    } else {
      Alert.alert(
        "Welcome to Gundruk!",
        "Check your email to confirm your account, then sign in.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
      );
    }
  };

  const btnDisabled =
    loading ||
    usernameStatus === "taken" ||
    usernameStatus === "invalid" ||
    (username.length > 0 && usernameStatus === "checking");

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topInset + 24,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24,
          },
        ]}
        bottomOffset={30}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <GundrukLogo subtitle="Join the community" />

        <View style={styles.card}>
          {/* Username field + inline availability feedback */}
          <View style={{ gap: 4 }}>
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor="rgba(156,163,175,0.55)"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused("username")}
              onBlur={() => setFocused(null)}
              style={[
                styles.input,
                focused === "username" && styles.inputFocused,
                usernameStatus === "taken" && styles.inputError,
                usernameStatus === "available" && styles.inputOk,
              ]}
            />
            {usernameStatus === "checking" && (
              <View style={styles.feedbackRow}>
                <ActivityIndicator size="small" color="rgba(255,255,255,0.4)" />
                <Text style={[styles.feedbackText, { color: "rgba(255,255,255,0.4)" }]}>
                  Checking…
                </Text>
              </View>
            )}
            {usernameStatus === "available" && (
              <Text style={styles.feedbackAvailable}>✅ Username available</Text>
            )}
            {usernameStatus === "taken" && (
              <Text style={styles.feedbackTaken}>❌ Username already taken</Text>
            )}
            {usernameStatus === "invalid" && (
              <Text style={styles.feedbackInvalid}>
                ⚠️ 3–20 chars, letters, numbers, underscores only
              </Text>
            )}
          </View>

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="rgba(156,163,175,0.55)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            style={[styles.input, focused === "email" && styles.inputFocused]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password (min 6 characters)"
            placeholderTextColor="rgba(156,163,175,0.55)"
            secureTextEntry
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            style={[styles.input, focused === "password" && styles.inputFocused]}
          />
          <GradientButton
            onPress={handleSignup}
            title="Create Account"
            loading={loading}
            style={styles.btn}
            disabled={btnDisabled}
          />
        </View>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
            Already on Gundruk?{" "}
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.loginLink}>Sign in →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },
  content: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 28 },
  backText: { fontSize: 15, fontFamily: "Poppins_500Medium", color: "rgba(255,255,255,0.45)" },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    marginBottom: 24,
    ...Platform.select({ web: { backdropFilter: "blur(20px)" } as any }),
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
  inputOk: {
    borderColor: "rgba(34,197,94,0.4)",
  },
  btn: { marginTop: 4 },
  loginRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  loginText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  loginLink: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 4 },
  feedbackText: { fontSize: 12, fontFamily: "Poppins_400Regular" },
  feedbackAvailable: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#22C55E", paddingLeft: 4 },
  feedbackTaken: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#F87171", paddingLeft: 4 },
  feedbackInvalid: { fontSize: 12, fontFamily: "Poppins_500Medium", color: "#FBBF24", paddingLeft: 4 },
});
