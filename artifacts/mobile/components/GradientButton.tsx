import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from "react-native";

interface GradientButtonProps {
  onPress: () => void;
  title: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  small?: boolean;
}

export function GradientButton({
  onPress,
  title,
  loading = false,
  disabled = false,
  style,
  small = false,
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.82}
      style={style}
    >
      <LinearGradient
        colors={["#7C3AED", "#C2410C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.gradient, small && styles.small, (disabled || loading) && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={[styles.text, small && styles.smallText]}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  small: {
    height: 36,
    borderRadius: 10,
    paddingHorizontal: 16,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
    letterSpacing: 0.3,
  },
  smallText: {
    fontSize: 13,
  },
});
