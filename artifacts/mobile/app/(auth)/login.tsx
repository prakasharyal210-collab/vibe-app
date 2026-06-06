import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
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

function BackgroundOrbs() {
  const anim1 = useRef(new Animated.Value(0)).current;
  const anim2 = useRef(new Animated.Value(0)).current;
  const anim3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = (val: Animated.Value, dur: number, dist: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, { toValue: 1, duration: dur, useNativeDriver: true }),
          Animated.timing(val, { toValue: 0, duration: dur, useNativeDriver: true }),
        ])
      ).start();
    loop(anim1, 4200, 30);
    loop(anim2, 5800, 25);
    loop(anim3, 7000, 20);
  }, []);

  const ty1 = anim1.interpolate({ inputRange: [0, 1], outputRange: [0, -30] });
  const ty2 = anim2.interpolate({ inputRange: [0, 1], outputRange: [0, 25] });
  const ty3 = anim3.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[orbStyles.orb, orbStyles.orb1, { transform: [{ translateY: ty1 }] }]} />
      <Animated.View style={[orbStyles.orb, orbStyles.orb2, { transform: [{ translateY: ty2 }] }]} />
      <Animated.View style={[orbStyles.orb, orbStyles.orb3, { transform: [{ translateY: ty3 }] }]} />
    </View>
  );
}

const orbStyles = StyleSheet.create({
  orb: {
    position: "absolute",
    borderRadius: 999,
  },
  orb1: {
    width: 340,
    height: 340,
    top: -80,
    left: -60,
    backgroundColor: "rgba(139,92,246,0.18)",
    ...Platform.select({ web: { filter: "blur(80px)" } as any }),
  },
  orb2: {
    width: 280,
    height: 280,
    top: 200,
    right: -80,
    backgroundColor: "rgba(236,72,153,0.14)",
    ...Platform.select({ web: { filter: "blur(80px)" } as any }),
  },
  orb3: {
    width: 240,
    height: 240,
    bottom: 60,
    left: 40,
    backgroundColor: "rgba(249,115,22,0.12)",
    ...Platform.select({ web: { filter: "blur(80px)" } as any }),
  },
});

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);

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
    <View style={styles.root}>
      <BackgroundOrbs />

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
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoGlowWrap}>
            <View style={styles.logoGlow} />
            <View style={styles.logoBox}>
              {Platform.OS === "web" ? (
                <Text
                  style={[styles.logoText, {
                    // @ts-ignore web only
                    background: "linear-gradient(135deg, #8B5CF6, #EC4899, #F97316)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }]}
                >
                  VIBE
                </Text>
              ) : (
                <LinearGradient
                  colors={["#8B5CF6", "#EC4899", "#F97316"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.logoGradientText}
                >
                  <Text style={styles.logoText}>VIBE</Text>
                </LinearGradient>
              )}
            </View>
          </View>
          <Text style={styles.headline}>Welcome back</Text>
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Share your world, your way ✨
          </Text>
        </View>

        {/* Glassmorphism form card */}
        <View style={styles.card}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor="rgba(156,163,175,0.6)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            onFocus={() => setFocused("email")}
            onBlur={() => setFocused(null)}
            style={[
              styles.input,
              focused === "email" && styles.inputFocused,
            ]}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="rgba(156,163,175,0.6)"
            secureTextEntry
            onFocus={() => setFocused("password")}
            onBlur={() => setFocused(null)}
            style={[
              styles.input,
              focused === "password" && styles.inputFocused,
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
            <Text style={styles.signupLink}>Create account →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#080810",
  },
  content: {
    paddingHorizontal: 24,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoGlowWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoGlow: {
    position: "absolute",
    width: 120,
    height: 60,
    borderRadius: 60,
    backgroundColor: "rgba(139,92,246,0.35)",
    ...Platform.select({ web: { filter: "blur(30px)" } as any }),
  },
  logoBox: {
    overflow: "hidden",
    borderRadius: 12,
  },
  logoGradientText: {
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  logoText: {
    fontSize: 48,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    letterSpacing: 10,
  },
  headline: {
    fontSize: 26,
    fontFamily: "Poppins_700Bold",
    color: "#fff",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  tagline: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 24,
    padding: 24,
    gap: 14,
    marginBottom: 24,
    ...Platform.select({
      web: { backdropFilter: "blur(20px)" } as any,
    }),
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
  btn: {
    marginTop: 4,
  },
  forgotBtn: {
    alignItems: "center",
    paddingVertical: 2,
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
    color: "#A78BFA",
  },
});
