import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface LoginPromptProps {
  visible: boolean;
  onClose: () => void;
}

export function LoginPrompt({ visible, onClose }: LoginPromptProps) {
  const colors = useColors();

  const handleLogin = () => {
    onClose();
    router.push("/(auth)/login");
  };

  const handleSignup = () => {
    onClose();
    router.push("/(auth)/signup");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
          <Text style={styles.emoji}>✨</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Join Gundruk
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Sign in to like, comment, and connect with creators
          </Text>

          <TouchableOpacity onPress={handleLogin} style={styles.loginBtnWrap}>
            <LinearGradient
              colors={["#7C3AED", "#C2410C"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.loginBtn}
            >
              <Text style={styles.loginBtnText}>Sign In</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSignup}
            style={[styles.signupBtn, { borderColor: colors.border }]}
          >
            <Text style={[styles.signupBtnText, { color: colors.foreground }]}>
              Create Account
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={onClose} style={styles.skipBtn}>
            <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
              Maybe later
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
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  card: {
    width: "100%",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
    paddingBottom: 40,
  },
  emoji: {
    fontSize: 40,
    marginBottom: 4,
  },
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
  loginBtnWrap: {
    width: "100%",
  },
  loginBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  loginBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  signupBtn: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  signupBtnText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  skipBtn: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
});
