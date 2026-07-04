import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const RESEND_COOLDOWN = 60;

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { clearNeedsPasswordReset } = useAuth();

  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const [codeError, setCodeError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
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
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      startCooldown();
    } catch (e: any) {
      setFormError(e?.message ?? "Failed to resend. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    setCodeError(null);
    setPasswordError(null);
    setConfirmError(null);

    let valid = true;
    if (!code || code.length !== 6) {
      setCodeError("Enter the 6-digit code from your email");
      valid = false;
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      valid = false;
    }
    if (newPassword !== confirmPassword) {
      setConfirmError("Passwords do not match");
      valid = false;
    }
    if (!valid) return;

    setLoading(true);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email!,
        token: code,
        type: "recovery",
      });

      if (verifyError) {
        const m = verifyError.message.toLowerCase();
        if (m.includes("expired") || m.includes("invalid") || m.includes("otp")) {
          setCodeError("Code is invalid or has expired — request a new one below.");
        } else {
          setFormError(verifyError.message);
        }
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        const m = updateError.message.toLowerCase();
        if (m.includes("weak") || m.includes("password") || m.includes("characters")) {
          setPasswordError(updateError.message);
        } else {
          setFormError(updateError.message);
        }
        return;
      }

      setDone(true);
    } catch (e: any) {
      setFormError(e?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    clearNeedsPasswordReset();
    router.replace("/(tabs)/feed");
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
        {!done && (
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        )}

        <GundrukLogo subtitle="Set new password" />

        {done ? (
          <View style={styles.card}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Password updated!</Text>
            <Text style={[styles.successBody, { color: colors.mutedForeground }]}>
              Your password has been changed successfully. You can now sign in.
            </Text>
            <GradientButton onPress={handleContinue} title="Continue to App" />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              Enter the 6-digit code sent to{" "}
              <Text style={styles.emailHighlight}>{email}</Text>
              {" "}and choose a new password.
            </Text>

            {/* OTP input */}
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

            {/* New password */}
            <View style={{ gap: 4 }}>
              <TextInput
                value={newPassword}
                onChangeText={v => {
                  setNewPassword(v);
                  setPasswordError(null);
                  setFormError(null);
                }}
                placeholder="New password"
                placeholderTextColor="rgba(156,163,175,0.55)"
                secureTextEntry
                style={[styles.input, passwordError != null && styles.inputError]}
              />
              {passwordError != null && (
                <Text style={styles.fieldError}>⚠️ {passwordError}</Text>
              )}
            </View>

            {/* Confirm password */}
            <View style={{ gap: 4 }}>
              <TextInput
                value={confirmPassword}
                onChangeText={v => {
                  setConfirmPassword(v);
                  setConfirmError(null);
                  setFormError(null);
                }}
                placeholder="Confirm new password"
                placeholderTextColor="rgba(156,163,175,0.55)"
                secureTextEntry
                style={[styles.input, confirmError != null && styles.inputError]}
              />
              {confirmError != null && (
                <Text style={styles.fieldError}>⚠️ {confirmError}</Text>
              )}
            </View>

            {formError != null && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            )}

            <GradientButton
              onPress={handleSubmit}
              title="Set New Password"
              loading={loading}
              disabled={loading}
              style={{ marginTop: 4 }}
            />

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
        )}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080810" },
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
    fontSize: 20,
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
  successIcon: { fontSize: 48, textAlign: "center" },
  successTitle: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    textAlign: "center",
  },
  successBody: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
});
