import { router, useLocalSearchParams } from "expo-router";
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
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const RESEND_COOLDOWN = 60;

export default function VerifyEmailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const [codeError, setCodeError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN);
    timerRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || resending || !email) return;
    setResending(true);
    setFormError(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      startCooldown();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    setCodeError(null);
    setFormError(null);

    if (!code || code.length !== 6) {
      setCodeError("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email!,
        token: code,
        type: "signup",
      });

      if (error) {
        const m = error.message.toLowerCase();
        if (m.includes("expired") || m.includes("invalid") || m.includes("otp")) {
          setCodeError("Code is invalid or has expired — request a new one below.");
        } else {
          setFormError(error.message);
        }
        return;
      }

      // Success: Supabase fires SIGNED_IN → AuthContext sets session →
      // RootLayoutNav auto-redirects to /(tabs)/feed.
      // Show a brief bridging state while that propagates.
      setVerified(true);
    } catch (e: any) {
      setFormError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // Brief bridging UI while AuthContext processes the SIGNED_IN event
  if (verified) {
    return (
      <View style={[styles.root, styles.centeredRoot]}>
        <ActivityIndicator size="large" color="#8B5CF6" />
        <Text style={[styles.signingInText, { color: colors.mutedForeground }]}>
          Signing you in…
        </Text>
      </View>
    );
  }

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
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <GundrukLogo subtitle="Confirm your email" />

        <View style={styles.card}>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Enter the 6-digit code sent to{" "}
            <Text style={styles.emailHighlight}>{email}</Text>
          </Text>

          {/* OTP code input */}
          <View style={{ gap: 4 }}>
            <TextInput
              value={code}
              onChangeText={v => {
                setCode(v.replace(/\D/g, "").slice(0, 6));
                setCodeError(null);
                setFormError(null);
              }}
              placeholder="6-digit code"
              placeholderTextColor="rgba(156,163,175,0.55)"
              keyboardType="number-pad"
              maxLength={6}
              style={[styles.input, styles.codeInput, codeError != null && styles.inputError]}
            />
            {codeError != null && (
              <Text style={styles.fieldError}>⚠️ {codeError}</Text>
            )}
          </View>

          {formError != null && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorBannerText}>{formError}</Text>
            </View>
          )}

          <GradientButton
            onPress={handleVerify}
            title="Confirm Account"
            loading={loading}
            disabled={loading}
            style={{ marginTop: 4 }}
          />

          {/* Resend */}
          <TouchableOpacity
            onPress={handleResend}
            disabled={resendCooldown > 0 || resending}
            style={styles.resendRow}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.resendText,
                { color: resendCooldown > 0 ? colors.mutedForeground : "#A78BFA" },
              ]}
            >
              {resending
                ? "Sending…"
                : resendCooldown > 0
                ? `Resend code in ${resendCooldown}s`
                : "Resend code"}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
            Wrong account?{" "}
          </Text>
          <TouchableOpacity
            onPress={() => router.replace("/(auth)/login")}
            activeOpacity={0.7}
          >
            <Text style={styles.loginLink}>Sign in instead →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },
  centeredRoot: { alignItems: "center", justifyContent: "center", gap: 16 },
  content: { paddingHorizontal: 24 },
  backBtn: { marginBottom: 28 },
  backText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    color: "rgba(255,255,255,0.45)",
  },
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
  description: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    lineHeight: 22,
  },
  emailHighlight: {
    fontFamily: "Poppins_600SemiBold",
    color: "#A78BFA",
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
  codeInput: {
    letterSpacing: 6,
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  inputError: {
    borderColor: "rgba(248,113,113,0.5)",
    backgroundColor: "rgba(248,113,113,0.05)",
  },
  fieldError: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    color: "#F87171",
    paddingLeft: 2,
  },
  errorBanner: {
    backgroundColor: "rgba(248,113,113,0.1)",
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  errorBannerText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
    color: "#FCA5A5",
    lineHeight: 20,
  },
  resendRow: { alignItems: "center", paddingVertical: 4 },
  resendText: { fontSize: 14, fontFamily: "Poppins_500Medium" },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loginText: { fontSize: 14, fontFamily: "Poppins_400Regular" },
  loginLink: { fontSize: 14, fontFamily: "Poppins_600SemiBold", color: "#A78BFA" },
  signingInText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
    marginTop: 8,
  },
});
