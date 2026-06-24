import { Ionicons } from "@expo/vector-icons";
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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GradientButton } from "@/components/GradientButton";
import { GundrukLogo } from "@/components/GundrukLogo";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const API_BASE = (process.env["EXPO_PUBLIC_API_URL"] ?? "").replace(/\/$/, "");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v: string) { return EMAIL_RE.test(v.trim()); }

type UsernameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused]   = useState<"username" | "email" | "password" | null>(null);

  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline field errors
  const [emailError, setEmailError]       = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  // Form-level banner (email-exists, network, etc.)
  const [formError, setFormError] = useState<string | "email_exists" | null>(null);

  // Post-signup verification screen state
  const [signupDone, setSignupDone]   = useState(false);
  const [signupEmail, setSignupEmail] = useState("");

  // Debounced username availability check
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

  // Clear email error as user types a valid email
  useEffect(() => {
    if (emailError && isValidEmail(email)) setEmailError(null);
  }, [email]);

  // Clear password error as user reaches min length
  useEffect(() => {
    if (passwordError && password.length >= 6) setPasswordError(null);
  }, [password]);

  const handleSignup = async () => {
    setFormError(null);
    let hasError = false;

    if (!username) { setFormError("Please fill in all fields"); hasError = true; }

    if (!email) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    }

    if (!password) {
      setPasswordError("Password is required");
      hasError = true;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      hasError = true;
    }

    if (usernameStatus === "taken") { setFormError("That username is already taken — please choose another."); hasError = true; }
    if (usernameStatus === "invalid") { setFormError("Username: 3–20 chars, letters, numbers, underscores only."); hasError = true; }
    if (hasError) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username } },
      });

      if (error) {
        const msg = error.message ?? "";
        const lower = msg.toLowerCase();
        if (lower.includes("already registered") || lower.includes("already exists") || lower.includes("user already")) {
          setFormError("email_exists");
        } else if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("failed to fetch")) {
          setFormError("Something went wrong. Please check your connection and try again.");
        } else {
          setFormError(msg || "Sign up failed. Please try again.");
        }
        return;
      }

      // identities === [] means Supabase silently accepted but email already exists
      if (data.user?.identities?.length === 0) {
        setFormError("email_exists");
        return;
      }

      // session === null means email confirmation required
      if (!data.session) {
        setSignupEmail(email.trim());
        setSignupDone(true);
      }
      // if session exists, _layout.tsx RootLayoutNav handles navigation automatically
    } catch {
      setFormError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const emailValid = isValidEmail(email);
  const btnDisabled =
    loading ||
    usernameStatus === "taken" ||
    usernameStatus === "invalid" ||
    (username.length > 0 && usernameStatus === "checking") ||
    (email.length > 0 && !emailValid);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Post-signup: email verification screen ────────────────────────────────
  if (signupDone) {
    return (
      <View style={styles.root}>
        <View
          style={[
            styles.content,
            {
              flex: 1,
              paddingTop: topInset + 48,
              paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24,
              justifyContent: "center",
            },
          ]}
        >
          <View style={styles.card}>
            <Text style={styles.verifyIcon}>✉️</Text>
            <Text style={styles.verifyTitle}>Check your email</Text>
            <Text style={[styles.verifyBody, { color: colors.mutedForeground }]}>
              We sent a confirmation link to
            </Text>
            <Text style={styles.verifyEmail}>{signupEmail}</Text>
            <Text style={[styles.verifyBody, { color: colors.mutedForeground, marginTop: 8 }]}>
              Click the link in that email to activate your account, then come back and sign in.
            </Text>
            <GradientButton
              onPress={() => router.replace("/(auth)/login")}
              title="Go to Sign In"
              style={{ marginTop: 8 }}
            />
          </View>
        </View>
      </View>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────
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
          {/* ── Username ── */}
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
                <Text style={[styles.fieldHint, { color: "rgba(255,255,255,0.4)" }]}>Checking…</Text>
              </View>
            )}
            {usernameStatus === "available" && (
              <Text style={[styles.fieldHint, { color: "#22C55E" }]}>✅ Username available</Text>
            )}
            {usernameStatus === "taken" && (
              <Text style={[styles.fieldHint, { color: "#F87171" }]}>❌ Username already taken</Text>
            )}
            {usernameStatus === "invalid" && (
              <Text style={[styles.fieldHint, { color: "#FBBF24" }]}>
                ⚠️ 3–20 chars, letters, numbers, underscores only
              </Text>
            )}
          </View>

          {/* ── Email ── */}
          <View style={{ gap: 4 }}>
            <TextInput
              value={email}
              onChangeText={v => { setEmail(v); setFormError(null); }}
              placeholder="Email address"
              placeholderTextColor="rgba(156,163,175,0.55)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused("email")}
              onBlur={() => setFocused(null)}
              style={[
                styles.input,
                focused === "email" && styles.inputFocused,
                emailError != null && styles.inputError,
              ]}
            />
            {emailError != null && (
              <Text style={[styles.fieldHint, { color: "#F87171" }]}>⚠️ {emailError}</Text>
            )}
          </View>

          {/* ── Password ── */}
          <View style={{ gap: 4 }}>
            <View style={styles.passwordWrap}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                placeholderTextColor="rgba(156,163,175,0.55)"
                secureTextEntry={!showPassword}
                onFocus={() => setFocused("password")}
                onBlur={() => setFocused(null)}
                style={[
                  styles.input,
                  styles.passwordInput,
                  focused === "password" && styles.inputFocused,
                  passwordError != null && styles.inputError,
                ]}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(v => !v)}
                style={styles.eyeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color="rgba(255,255,255,0.45)"
                />
              </TouchableOpacity>
            </View>
            {passwordError != null ? (
              <Text style={[styles.fieldHint, { color: "#F87171" }]}>⚠️ {passwordError}</Text>
            ) : (
              <Text style={[styles.fieldHint, { color: "rgba(255,255,255,0.35)" }]}>
                At least 6 characters
              </Text>
            )}
          </View>

          {/* ── Form-level error banner ── */}
          {formError != null && formError !== "email_exists" && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}
          {formError === "email_exists" && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>
                This email is already registered.{" "}
              </Text>
              <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
                <Text style={[styles.errorBannerText, styles.errorBannerLink]}>Log in instead →</Text>
              </TouchableOpacity>
            </View>
          )}

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
  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 50 },
  eyeBtn: { position: "absolute", right: 14, top: 16 },
  btn: { marginTop: 4 },
  loginRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  loginText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  loginLink: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
  feedbackRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 2 },
  fieldHint: { fontSize: 12, fontFamily: "Poppins_400Regular", paddingLeft: 2 },
  errorBanner: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  errorBannerText: { fontSize: 13, fontFamily: "Poppins_400Regular", color: "#FCA5A5", lineHeight: 20 },
  errorBannerLink: { fontFamily: "Poppins_600SemiBold", color: "#F87171", textDecorationLine: "underline" },
  // Verification screen
  verifyIcon: { fontSize: 48, textAlign: "center", marginBottom: 8 },
  verifyTitle: { fontSize: 22, fontFamily: "Poppins_700Bold", color: "#fff", textAlign: "center", marginBottom: 10 },
  verifyBody: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  verifyEmail: { fontSize: 15, fontFamily: "Poppins_600SemiBold", color: "#A78BFA", textAlign: "center" },
});
