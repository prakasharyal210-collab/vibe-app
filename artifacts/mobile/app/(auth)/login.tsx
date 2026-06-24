import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import RAnimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GradientButton } from "@/components/GradientButton";
import { GundrukLogo } from "@/components/GundrukLogo";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v: string) { return EMAIL_RE.test(v.trim()); }

function friendlyLoginError(msg: string): string {
  const m = msg.toLowerCase();
  if (
    m.includes("invalid login") ||
    m.includes("invalid credentials") ||
    m.includes("wrong password") ||
    m.includes("user not found") ||
    m.includes("invalid email or password") ||
    m.includes("email not confirmed") ||
    m.includes("invalid password")
  ) {
    return "Incorrect email or password.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("timeout") || m.includes("failed to fetch")) {
    return "Something went wrong. Please check your connection and try again.";
  }
  // Unknown — give a safe generic message (don't surface raw Supabase strings)
  return "Something went wrong. Please check your connection and try again.";
}

function BackgroundOrbs() {
  const ty1 = useSharedValue(0);
  const ty2 = useSharedValue(0);
  const ty3 = useSharedValue(0);

  React.useEffect(() => {
    ty1.value = withRepeat(withSequence(withTiming(-30, { duration: 4200 }), withTiming(0, { duration: 4200 })), -1, false);
    ty2.value = withRepeat(withSequence(withTiming(25, { duration: 5800 }), withTiming(0, { duration: 5800 })), -1, false);
    ty3.value = withRepeat(withSequence(withTiming(-18, { duration: 7000 }), withTiming(0, { duration: 7000 })), -1, false);
    return () => { cancelAnimation(ty1); cancelAnimation(ty2); cancelAnimation(ty3); };
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: ty1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: ty2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: ty3.value }] }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <RAnimated.View style={[orbStyles.orb, orbStyles.orb1, s1]} />
      <RAnimated.View style={[orbStyles.orb, orbStyles.orb2, s2]} />
      <RAnimated.View style={[orbStyles.orb, orbStyles.orb3, s3]} />
    </View>
  );
}

const orbStyles = StyleSheet.create({
  orb: { position: "absolute", borderRadius: 999 },
  orb1: {
    width: 340, height: 340, top: -80, left: -60,
    backgroundColor: "rgba(139,92,246,0.16)",
    ...Platform.select({ web: { filter: "blur(90px)" } as any }),
  },
  orb2: {
    width: 280, height: 280, top: 220, right: -80,
    backgroundColor: "rgba(236,72,153,0.12)",
    ...Platform.select({ web: { filter: "blur(80px)" } as any }),
  },
  orb3: {
    width: 240, height: 240, bottom: 60, left: 30,
    backgroundColor: "rgba(249,115,22,0.10)",
    ...Platform.select({ web: { filter: "blur(70px)" } as any }),
  },
});

class LoginErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: "#080810", justifyContent: "center", alignItems: "center", padding: 32 }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", textAlign: "center", marginBottom: 10 }}>Sign In failed to load</Text>
          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 13, textAlign: "center", marginBottom: 28 }}>{this.state.error}</Text>
          <TouchableOpacity
            onPress={() => this.setState({ error: null })}
            style={{ backgroundColor: "#7C3AED", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focused, setFocused]   = useState<"email" | "password" | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);

  React.useEffect(() => { console.log("[LoginScreen] mounted"); }, []);

  // Clear email error once user fixes the address
  React.useEffect(() => {
    if (emailError && isValidEmail(email)) setEmailError(null);
  }, [email]);

  const handleLogin = async () => {
    setFormError(null);
    let hasError = false;

    if (!email) {
      setEmailError("Email is required");
      hasError = true;
    } else if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      hasError = true;
    }

    if (!password) {
      setFormError("Please enter your password.");
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        setFormError(friendlyLoginError(error.message ?? ""));
      }
      // On success: navigation is handled by RootLayoutNav in _layout.tsx
    } catch {
      setFormError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const emailOk = email.length === 0 || isValidEmail(email);
  const btnDisabled = loading || (email.length > 0 && !emailOk);

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={styles.root}>
      <BackgroundOrbs />

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topInset + 48,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24,
          },
        ]}
        bottomOffset={30}
      >
        <GundrukLogo subtitle="Welcome back" />

        <View style={styles.card}>
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
              <Text style={styles.fieldError}>⚠️ {emailError}</Text>
            )}
          </View>

          {/* ── Password ── */}
          <View style={styles.passwordWrap}>
            <TextInput
              value={password}
              onChangeText={v => { setPassword(v); setFormError(null); }}
              placeholder="Password"
              placeholderTextColor="rgba(156,163,175,0.55)"
              secureTextEntry={!showPassword}
              onFocus={() => setFocused("password")}
              onBlur={() => setFocused(null)}
              style={[
                styles.input,
                styles.passwordInput,
                focused === "password" && styles.inputFocused,
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

          {/* ── Form-level error banner ── */}
          {formError != null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}

          <GradientButton
            onPress={handleLogin}
            title="Sign In"
            loading={loading}
            style={styles.btn}
            disabled={btnDisabled}
          />

          <TouchableOpacity
            onPress={() => router.push("/(auth)/forgot-password")}
            style={styles.forgotBtn}
          >
            <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>
              Forgot password?
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.signupRow}>
          <Text style={[styles.signupText, { color: colors.mutedForeground }]}>New to Gundruk?{" "}</Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
            <Text style={styles.signupLink}>Create account →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },
  content: { paddingHorizontal: 24 },
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
  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 50 },
  eyeBtn: { position: "absolute", right: 14, top: 16 },
  btn: { marginTop: 4 },
  forgotBtn: { alignItems: "center", paddingVertical: 2 },
  forgotText: { fontSize: 13, fontFamily: "Poppins_400Regular" },
  signupRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  signupText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  signupLink: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
  fieldError: { fontSize: 12, fontFamily: "Poppins_400Regular", color: "#F87171", paddingLeft: 2 },
  errorBanner: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorBannerText: { fontSize: 13, fontFamily: "Poppins_400Regular", color: "#FCA5A5", lineHeight: 20 },
});

export default function LoginScreenWrapper() {
  return (
    <LoginErrorBoundary>
      <LoginScreen />
    </LoginErrorBoundary>
  );
}
