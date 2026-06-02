import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LoginPrompt } from "@/components/LoginPrompt";
import { GradientButton } from "@/components/GradientButton";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

type CreateType = "reel" | "post" | "story" | null;

export default function CreateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const isLoggedIn = !!session;

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [createType, setCreateType] = useState<CreateType>(null);
  const [image, setImage] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 84 : insets.bottom + 50;

  useEffect(() => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
    }
  }, [isLoggedIn]);

  const handleChooseType = (type: CreateType) => {
    if (!isLoggedIn) {
      setShowLoginPrompt(true);
      return;
    }
    setCreateType(type);
    setImage(null);
    setCaption("");
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: createType === "reel" ? [9, 16] : createType === "story" ? [9, 16] : [1, 1],
      quality: 0.85,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: createType === "post" ? [1, 1] : [9, 16],
      quality: 0.85,
    });
    if (!result.canceled) setImage(result.assets[0].uri);
  };

  const handlePost = async () => {
    if (!image) {
      Alert.alert("No image", "Please select or capture a photo.");
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

      const { data: { publicUrl } } = supabase.storage.from("posts").getPublicUrl(fileName);

      await supabase.from("posts").insert({
        user_id: user.id,
        image_url: publicUrl,
        caption,
        likes_count: 0,
        comments_count: 0,
      });

      setImage(null);
      setCaption("");
      setCreateType(null);
      Alert.alert("Posted!", "Your vibe is live. ✨");
    } catch (err: any) {
      Alert.alert(
        "Post failed",
        err?.message ?? "Make sure the 'posts' Supabase Storage bucket exists."
      );
    } finally {
      setUploading(false);
    }
  };

  const typeLabel: Record<NonNullable<CreateType>, string> = {
    reel: "New Reel",
    post: "New Post",
    story: "New Story",
  };

  if (!isLoggedIn) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.guestContainer, { paddingTop: topInset + 40 }]}>
          <LinearGradient
            colors={["#7C3AED", "#EA580C"]}
            style={styles.guestIconCircle}
          >
            <Ionicons name="add" size={40} color="#fff" />
          </LinearGradient>
          <Text style={[styles.guestTitle, { color: colors.foreground }]}>
            Create & Share
          </Text>
          <Text style={[styles.guestSubtitle, { color: colors.mutedForeground }]}>
            Sign in to post reels, photos, and stories
          </Text>
          <GradientButton
            onPress={() => router.push("/(auth)/login")}
            title="Sign In"
            style={{ width: "80%" }}
          />
        </View>
        <LoginPrompt
          visible={showLoginPrompt}
          onClose={() => setShowLoginPrompt(false)}
        />
      </View>
    );
  }

  if (!createType) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          contentContainerStyle={[
            styles.chooseContainer,
            { paddingTop: topInset + 20, paddingBottom: bottomInset },
          ]}
        >
          <Text style={[styles.title, { color: colors.foreground }]}>Create</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            What are you sharing today?
          </Text>

          {(
            [
              {
                type: "reel" as CreateType,
                icon: "play-circle-outline",
                label: "Reel",
                desc: "Short vertical video or snap",
                gradient: ["#7C3AED", "#A855F7"],
              },
              {
                type: "post" as CreateType,
                icon: "image-outline",
                label: "Post",
                desc: "Share a photo with your followers",
                gradient: ["#EA580C", "#F97316"],
              },
              {
                type: "story" as CreateType,
                icon: "radio-button-on-outline",
                label: "Story",
                desc: "Disappears after 24 hours",
                gradient: ["#DB2777", "#9333EA"],
              },
            ] as const
          ).map((item) => (
            <TouchableOpacity
              key={item.type}
              onPress={() => handleChooseType(item.type)}
              style={[
                styles.typeCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
              activeOpacity={0.82}
            >
              <LinearGradient
                colors={item.gradient as [string, string]}
                style={styles.typeIconCircle}
              >
                <Ionicons name={item.icon as any} size={28} color="#fff" />
              </LinearGradient>
              <View style={styles.typeInfo}>
                <Text style={[styles.typeLabel, { color: colors.foreground }]}>
                  {item.label}
                </Text>
                <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>
                  {item.desc}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[
          styles.editorContainer,
          { paddingTop: topInset + 8, paddingBottom: bottomInset },
        ]}
      >
        <View style={styles.editorHeader}>
          <TouchableOpacity onPress={() => setCreateType(null)}>
            <Ionicons name="chevron-back" size={26} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={[styles.editorTitle, { color: colors.foreground }]}>
            {typeLabel[createType]}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        <TouchableOpacity
          onPress={pickImage}
          style={[
            styles.imagePicker,
            {
              backgroundColor: colors.muted,
              borderColor: image ? "transparent" : colors.border,
              aspectRatio: createType === "post" ? 1 : 9 / 16,
            },
          ]}
        >
          {image ? (
            <>
              <Image source={{ uri: image }} style={styles.preview} resizeMode="cover" />
              <TouchableOpacity onPress={() => setImage(null)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={28} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.placeholderCenter}>
              <LinearGradient colors={["#7C3AED", "#F97316"]} style={styles.iconCircle}>
                <Ionicons name="image-outline" size={28} color="#fff" />
              </LinearGradient>
              <Text style={[styles.placeholderText, { color: colors.foreground }]}>
                Tap to select
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.actionRow}>
          <TouchableOpacity
            onPress={openCamera}
            style={[styles.mediaBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="camera-outline" size={20} color="#7C3AED" />
            <Text style={[styles.mediaBtnText, { color: colors.foreground }]}>Camera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImage}
            style={[styles.mediaBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
          >
            <Ionicons name="images-outline" size={20} color="#F97316" />
            <Text style={[styles.mediaBtnText, { color: colors.foreground }]}>Gallery</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          value={caption}
          onChangeText={setCaption}
          placeholder={`Add a caption${createType === "reel" ? " or lyrics..." : "..."}`}
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
          title={uploading ? "Sharing..." : `Share ${typeLabel[createType]}`}
          loading={uploading}
          disabled={!image}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  guestContainer: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  guestIconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  guestTitle: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    textAlign: "center",
  },
  guestSubtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 8,
  },
  chooseContainer: {
    paddingHorizontal: 20,
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontFamily: "Poppins_700Bold",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    marginBottom: 12,
  },
  typeCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
  },
  typeIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  typeInfo: { flex: 1 },
  typeLabel: {
    fontSize: 17,
    fontFamily: "Poppins_600SemiBold",
  },
  typeDesc: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
    marginTop: 2,
  },
  editorContainer: {
    paddingHorizontal: 18,
    gap: 14,
  },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  editorTitle: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
  },
  imagePicker: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  preview: { width: "100%", height: "100%" },
  removeBtn: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  placeholderCenter: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    fontSize: 15,
    fontFamily: "Poppins_600SemiBold",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  mediaBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  mediaBtnText: {
    fontSize: 14,
    fontFamily: "Poppins_500Medium",
  },
  captionInput: {
    minHeight: 80,
    borderRadius: 14,
    padding: 14,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    borderWidth: 1,
    textAlignVertical: "top",
  },
});
