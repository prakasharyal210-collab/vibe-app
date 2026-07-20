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
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

const RESEND_COOLDOWN = 60;

// Race a Supabase promise against a 12-second timeout.
// Supabase JS doesn't accept AbortController signals directly, so Promise.race
// is the equivalent mechanism.
function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Request timed out — check your connection and try again.",
            ),
          ),
        12_000,
      ),
    ),
  ]);
}

export default function ResetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { email: emailParam } = useLocalSearchParams<{ email: string }>();
  const { session, needsPasswordReset, clearNeedsPasswordReset } = useAuth();

  // Email comes from the route param (set by forgot-password) or from the
  // recovery session itself (when the user tapped the link in a cold-launch).
  const email = emailParam ?? session?.user?.email ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

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
      setResendCooldown((prev) => {
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
    setPasswordError(null);
    setConfirmError(null);

    let valid = true;
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
      // The PASSWORD_RECOVERY deep-link already established a recovery session
      // in AuthContext — we just update the password directly, no OTP needed.
      console.log("[ResetPassword] updateUser start");
      const { error: updateError } = await withTimeout(
        supabase.auth.updateUser({ password: newPassword }),
      );
      console.log("[ResetPassword] updateUser done", updateError ?? "ok");

      if (updateError) {
        console.error("[ResetPassword] updateUser error:", updateError.message);
        const m = updateError.message.toLowerCase();
        if (
          m.includes("weak") ||
          m.includes("password") ||
          m.includes("characters")
        ) {
          setPasswordError(updateError.message);
        } else {
          setFormError(updateError.message);
        }
        return;
      }

      setDone(true);
    } catch (e: any) {
      console.error("[ResetPassword] handleSubmit caught:", e?.message ?? e);
      const msg: string = e?.message ?? "";
      if (msg.toLowerCase().includes("timed out")) {
        setFormError("Request timed out — check your connection and try again.");
      } else if (msg) {
        setFormError(msg);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    clearNeedsPasswordReset();
    router.replace("/(tabs)/feed");
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  // ── Success state ────────────────────────────────────────────────────────────
  if (done) {
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
          <GundrukLogo subtitle="Set new password" />
          <View style={styles.card}>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successTitle}>Password updated!</Text>
            <Text style={[styles.successBody, { color: colors.mutedForeground }]}>
              Your password has been changed successfully. You can now sign in.
            </Text>
            <GradientButton onPress={handleContinue} title="Continue to App" />
          </View>
        </KeyboardAwareScrollViewCompat>
      </View>
    );
  }

  // ── Waiting state: user hasn't tapped the link yet ───────────────────────────
  // needsPasswordReset flips to true in AuthContext when PASSWORD_RECOVERY fires
  // (i.e. when the user taps the link in the email).
  if (!needsPasswordReset) {
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
          >
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <GundrukLogo subtitle="Check your email" />

          <View style={styles.card}>
            <ActivityIndicator
              size="small"
              color="#8B5CF6"
              style={{ marginBottom: 4 }}
            />
            <Text style={[styles.description, { color: colors.mutedForeground }]}>
              We sent a reset link to{" "}
              <Text style={styles.emailHighlight}>{email}</Text>. Tap the link
              in that email to continue setting your new password.
            </Text>

            {formError != null && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorBannerText}>{formError}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleResend}
              disabled={resendCooldown > 0 || resending}
              style={styles.resendRow}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.resendText,
                  {
                    color:
                      resendCooldown > 0
                        ? colors.mutedForeground
                        : "#A78BFA",
                  },
                ]}
              >
                {resending
                  ? "Sending…"
                  : resendCooldown > 0
                    ? `Resend link in ${resendCooldown}s`
                    : "Resend link"}
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

  // ── Password entry state: recovery session is active ────────────────────────
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
        <GundrukLogo subtitle="Set new password" />

        <View style={styles.card}>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            Choose a new password for{" "}
            <Text style={styles.emailHighlight}>{email}</Text>.
          </Text>

          {/* New password */}
          <View style={{ gap: 4 }}>
            <TextInput
              value={newPassword}
              onChangeText={(v) => {
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
              onChangeText={(v) => {
                setConfirmPassword(v);
                setConfirmError(null);
                setFormError(null);
              }}
              placeholder="Confirm new password"
              placeholderTextColor="rgba(156,163,175,0.55)"
              secureTextEntry
              style={[
                styles.input,
                confirmError != null && styles.inputError,
              ]}
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
        </View>
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
  loginLink: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#A78BFA",
  },
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
