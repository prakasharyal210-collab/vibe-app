import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
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
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      Alert.alert("Sign In Failed", error.message);
    } else {
      router.replace("/(tabs)");
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["rgba(124,58,237,0.25)", "transparent"]}
        style={styles.topGlow}
      />
      <LinearGradient
        colors={["transparent", "rgba(249,115,22,0.15)"]}
        style={styles.bottomGlow}
      />

      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topInset + 40,
            paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24,
          },
        ]}
        bottomOffset={30}
      >
        <View style={styles.logoContainer}>
          <LinearGradient
            colors={["#7C3AED", "#F97316"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.logoGradient}
          >
            <Text style={styles.logoText}>VIBE</Text>
          </LinearGradient>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Share your world, your way
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
            ]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
            ]}
          />
          <GradientButton
            onPress={handleLogin}
            title="Sign In"
            loading={loading}
            style={styles.btn}
          />

          <TouchableOpacity onPress={() => {}} style={styles.forgotBtn}>
            <Text style={[styles.forgotText, { color: colors.mutedForeground }]}>
              Forgot password?
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.signupRow}>
          <Text style={[styles.signupText, { color: colors.mutedForeground }]}>
            New to Vibe?{" "}
          </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
            <Text style={styles.signupLink}>Create account</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  bottomGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
  },
  content: {
    paddingHorizontal: 28,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 52,
  },
  logoGradient: {
    paddingHorizontal: 24,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 42,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    letterSpacing: 8,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  form: {
    gap: 14,
    marginBottom: 24,
  },
  input: {
    height: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
  },
  btn: {
    marginTop: 6,
  },
  forgotBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  signupText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  signupLink: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#7C3AED",
  },
});
