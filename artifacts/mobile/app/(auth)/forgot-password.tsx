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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GradientButton } from "@/components/GradientButton";
import { GundrukLogo } from "@/components/GundrukLogo";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(v: string) { return EMAIL_RE.test(v.trim()); }

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail]           = useState("");
  const [loading, setLoading]       = useState(false);
  const [focused, setFocused]       = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError]   = useState<string | null>(null);
  React.useEffect(() => {
    if (emailError && isValidEmail(email)) setEmailError(null);
  }, [email]);

  const handleReset = async () => {
    setFormError(null);

    if (!email) {
      setEmailError("Email is required");
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
      if (error) {
        const m = error.message?.toLowerCase() ?? "";
        if (m.includes("network") || m.includes("fetch") || m.includes("timeout") || m.includes("failed to fetch")) {
          setFormError("Something went wrong. Please check your connection and try again.");
          return;
        }
        // Don't surface "user not found" — navigate anyway to prevent email enumeration
      }
      router.push({ pathname: "/(auth)/reset-password", params: { email: email.trim() } });
    } catch {
      setFormError("Something went wrong. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

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

        <GundrukLogo subtitle="Reset your password" />

        <View style={styles.card}>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Enter the email address for your account and we'll send you a password reset link.
          </Text>

          <View style={{ gap: 4 }}>
            <TextInput
              value={email}
              onChangeText={v => { setEmail(v); setFormError(null); }}
              placeholder="Email address"
              placeholderTextColor="rgba(156,163,175,0.55)"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[
                styles.input,
                focused && styles.inputFocused,
                emailError != null && styles.inputError,
              ]}
            />
            {emailError != null && (
              <Text style={styles.fieldError}>⚠️ {emailError}</Text>
            )}
          </View>

          {formError != null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}

          <GradientButton
            onPress={handleReset}
            title="Send Reset Link"
            loading={loading}
            disabled={loading}
            style={styles.btn}
          />
        </View>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
            Remember your password?{" "}
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
  description: { fontSize: 14, fontFamily: "Poppins_400Regular", lineHeight: 22 },
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
  btn: { marginTop: 4 },
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
  loginRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  loginText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  loginLink: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
  // Success state
  successIcon: { fontSize: 48, textAlign: "center" },
  successTitle: { fontSize: 20, fontFamily: "Poppins_700Bold", color: "#fff", textAlign: "center" },
  successBody: { fontSize: 14, fontFamily: "Poppins_400Regular", textAlign: "center", lineHeight: 22 },
  successEmail: { fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
});
