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

export default function SignupScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    if (!username || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
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
        "Welcome to Vibe!",
        "Check your email to confirm your account, then sign in.",
        [{ text: "OK", onPress: () => router.replace("/(auth)/login") }]
      );
    }
  };

  const topInset = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={["transparent", "rgba(124,58,237,0.2)"]}
        style={styles.bottomGlow}
      />

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
          <Text style={[styles.backText, { color: colors.mutedForeground }]}>
            ← Back
          </Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <LinearGradient
            colors={["#7C3AED", "#F97316"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.logoGradient}
          >
            <Text style={styles.logoText}>VIBE</Text>
          </LinearGradient>
          <Text style={[styles.subtitle, { color: colors.foreground }]}>
            Join the community
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
            ]}
          />
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
            placeholder="Password (min 6 chars)"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            style={[
              styles.input,
              { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
            ]}
          />
          <GradientButton
            onPress={handleSignup}
            title="Create Account"
            loading={loading}
            style={styles.btn}
          />
        </View>

        <View style={styles.loginRow}>
          <Text style={[styles.loginText, { color: colors.mutedForeground }]}>
            Already on Vibe?{" "}
          </Text>
          <TouchableOpacity onPress={() => router.replace("/(auth)/login")}>
            <Text style={styles.loginLink}>Sign in</Text>
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
  bottomGlow: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  content: {
    paddingHorizontal: 28,
  },
  backBtn: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 15,
    fontFamily: "Poppins_500Medium",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoGradient: {
    paddingHorizontal: 20,
    paddingVertical: 4,
    borderRadius: 8,
    marginBottom: 12,
  },
  logoText: {
    fontSize: 36,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    letterSpacing: 8,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
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
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loginText: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  loginLink: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
    color: "#7C3AED",
  },
});
