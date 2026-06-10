import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface LoginPromptProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

export function LoginPrompt({ visible, onClose, message }: LoginPromptProps) {
  const colors = useColors();

  const handleSignup = () => {
    onClose();
    router.push("/(auth)/signup");
  };

  const handleLogin = () => {
    onClose();
    router.push("/(auth)/login");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          <View style={styles.handle} />

          <Text style={styles.emoji}>✨</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Join Gundruk
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {message ?? "Sign up to like, comment and more"}
          </Text>

          <TouchableOpacity onPress={handleSignup} style={styles.signupBtnWrap}>
            <LinearGradient
              colors={["#7C3AED", "#6D28D9"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.signupBtn}
            >
              <Text style={styles.signupBtnText}>Sign Up</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleLogin}
            style={[styles.loginBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.loginBtnText, { color: colors.foreground }]}>
              Log In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
              Continue watching
            </Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
    paddingBottom: 44,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    marginBottom: 8,
  },
  emoji: { fontSize: 40, marginBottom: 4 },
  title: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  signupBtnWrap: { width: "100%" },
  signupBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  signupBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_700Bold",
  },
  loginBtn: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  skipBtn: { paddingVertical: 8 },
  skipText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
});
