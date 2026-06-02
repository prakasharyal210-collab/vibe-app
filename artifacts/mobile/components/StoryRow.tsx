import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { UserAvatar } from "./UserAvatar";

interface Story {
  id: string;
  username: string;
  isOwn?: boolean;
}

interface StoryRowProps {
  stories: Story[];
}

function StoryItem({ story }: { story: Story }) {
  const colors = useColors();

  return (
    <TouchableOpacity style={styles.storyItem} activeOpacity={0.8}>
      {story.isOwn ? (
        <View style={styles.ownStoryWrapper}>
          <UserAvatar username={story.username} size={56} />
          <View style={[styles.addBadge, { backgroundColor: "#7C3AED" }]}>
            <Ionicons name="add" size={12} color="#fff" />
          </View>
        </View>
      ) : (
        <LinearGradient
          colors={["#7C3AED", "#F97316"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.storyRing}
        >
          <View style={[styles.storyInner, { backgroundColor: colors.background }]}>
            <UserAvatar username={story.username} size={52} />
          </View>
        </LinearGradient>
      )}
      <Text
        style={[styles.storyName, { color: colors.foreground }]}
        numberOfLines={1}
      >
        {story.isOwn ? "Your Story" : story.username.split("_")[0]}
      </Text>
    </TouchableOpacity>
  );
}

export function StoryRow({ stories }: StoryRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {stories.map((story) => (
        <StoryItem key={story.id} story={story} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingVertical: 8,
  },
  content: {
    paddingHorizontal: 12,
    gap: 14,
  },
  storyItem: {
    alignItems: "center",
    gap: 5,
    width: 68,
  },
  ownStoryWrapper: {
    position: "relative",
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  storyInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  addBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#0A0A0F",
  },
  storyName: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
  },
});
