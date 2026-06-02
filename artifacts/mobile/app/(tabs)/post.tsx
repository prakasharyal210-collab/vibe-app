import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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

export default function PostScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) {
      setImage(result.assets[0].uri);
    }
  };

  const handlePost = async () => {
    if (!image) {
      Alert.alert("No image", "Please select or capture a photo first.");
      return;
    }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = image.split(".").pop() ?? "jpg";
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;

      const response = await fetch(image);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("posts")
        .upload(fileName, arrayBuffer, { contentType: `image/${fileExt}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("posts")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("posts").insert({
        user_id: user.id,
        image_url: publicUrl,
        caption,
        likes_count: 0,
        comments_count: 0,
      });

      if (insertError) throw insertError;

      setImage(null);
      setCaption("");
      Alert.alert("Posted!", "Your vibe is live.");
    } catch (err: any) {
      Alert.alert(
        "Post failed",
        err?.message ?? "Could not upload. Make sure the 'posts' storage bucket exists in Supabase."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <KeyboardAwareScrollViewCompat
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + 16, paddingBottom: bottomInset },
        ]}
        bottomOffset={20}
      >
        <Text style={[styles.title, { color: colors.foreground }]}>New Post</Text>

        <TouchableOpacity
          onPress={pickImage}
          activeOpacity={0.9}
          style={[
            styles.imagePicker,
            {
              backgroundColor: colors.muted,
              borderColor: image ? "transparent" : colors.border,
            },
          ]}
        >
          {image ? (
            <>
              <Image source={{ uri: image }} style={styles.preview} resizeMode="cover" />
              <TouchableOpacity
                onPress={() => setImage(null)}
                style={styles.removeBtn}
              >
                <Ionicons name="close-circle" size={28} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.placeholder}>
              <LinearGradient
                colors={["#7C3AED", "#F97316"]}
                style={styles.iconCircle}
              >
                <Ionicons name="image-outline" size={32} color="#fff" />
              </LinearGradient>
              <Text style={[styles.placeholderText, { color: colors.foreground }]}>
                Select from Gallery
              </Text>
              <Text style={[styles.placeholderSub, { color: colors.mutedForeground }]}>
                Square images work best
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={openCamera}
            style={[styles.cameraBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="camera-outline" size={22} color="#7C3AED" />
            <Text style={[styles.cameraBtnText, { color: colors.foreground }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImage}
            style={[styles.cameraBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="images-outline" size={22} color="#F97316" />
            <Text style={[styles.cameraBtnText, { color: colors.foreground }]}>Gallery</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder="Write a caption..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          maxLength={500}
          style={[
            styles.captionInput,
            { backgroundColor: colors.muted, color: colors.foreground, borderColor: colors.border },
          ]}
        />

        <GradientButton
          onPress={handlePost}
          title={uploading ? "Posting..." : "Share Vibe"}
          loading={uploading}
          disabled={!image}
        />
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
  },
  imagePicker: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  preview: {
    width: "100%",
    height: "100%",
  },
  removeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  placeholder: {
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 16,
    fontFamily: "Poppins_600SemiBold",
  },
  placeholderSub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  cameraBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  cameraBtnText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  captionInput: {
    minHeight: 90,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    textAlignVertical: "top",
  },
});
