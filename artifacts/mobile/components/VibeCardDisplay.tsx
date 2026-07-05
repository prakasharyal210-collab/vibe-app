import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { getGoalInfo, VibeMatchProfile } from "@/lib/db";

const { width: W } = Dimensions.get("window");

function GoalPill({ goal, size = "sm" }: { goal: string; size?: "sm" | "md" }) {
  const info = getGoalInfo(goal);
  if (!info) return null;
  const pad = size === "md"
    ? { px: 12, py: 6, fs: 13 }
    : { px: 9,  py: 3, fs: 11 };
  return (
    <View style={[
      gpStyles.pill,
      {
        backgroundColor: info.color + "25",
        borderColor:      info.color + "55",
        paddingHorizontal: pad.px,
        paddingVertical:   pad.py,
      },
    ]}>
      <Text style={{ fontSize: size === "md" ? 14 : 12 }}>{info.emoji}</Text>
      <Text style={[gpStyles.text, { color: info.color, fontSize: pad.fs }]}>
        {info.shortLabel}
      </Text>
    </View>
  );
}

const gpStyles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           4,
    borderRadius:  10,
    borderWidth:   1,
    alignSelf:     "flex-start",
  },
  text: { fontFamily: "Poppins_600SemiBold" },
});

export interface VibeCardDisplayProps {
  card:         VibeMatchProfile;
  matchPct?:    number;
  myGoals?:     string[];
  previewMode?: boolean;
  onExpand?:    () => void;
}

export function VibeCardDisplay({
  card,
  matchPct,
  myGoals,
  previewMode,
  onExpand,
}: VibeCardDisplayProps) {
  const photos = useMemo(() => {
    const extras = (card.vibe_photos ?? []).filter((url) => Boolean(url) && url !== card.image);
    return [card.image, ...extras];
  }, [card.id, card.image, card.vibe_photos]);

  const [photoIdx, setPhotoIdx] = useState(0);

  useEffect(() => {
    setPhotoIdx(0);
  }, [card.id]);

  useEffect(() => {
    const nextUrl = photos[photoIdx + 1];
    if (nextUrl) {
      Image.prefetch(nextUrl).catch(() => {});
    }
  }, [photos, photoIdx]);

  const currentPhoto = photos[Math.min(photoIdx, photos.length - 1)] ?? card.image;
  const hasMultiple = photos.length > 1;

  const goNext = () => setPhotoIdx((i) => Math.min(i + 1, photos.length - 1));
  const goPrev = () => setPhotoIdx((i) => Math.max(i - 1, 0));

  return (
    <>
      <Image
        source={{ uri: currentPhoto }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", "transparent", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.96)"]}
        locations={[0, 0.38, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      {hasMultiple && (
        <>
          <Pressable style={vcStyles.tapZoneLeft} onPress={goPrev} />
          <Pressable style={vcStyles.tapZoneRight} onPress={goNext} />
        </>
      )}

      {hasMultiple && (
        <View style={vcStyles.photoBars} pointerEvents="none">
          {photos.map((_, i) => (
            <View
              key={i}
              style={[
                vcStyles.photoBar,
                i < photoIdx && vcStyles.photoBarSeen,
                i === photoIdx && vcStyles.photoBarActive,
              ]}
            />
          ))}
        </View>
      )}

      {!previewMode && !!onExpand && (
        <TouchableOpacity onPress={onExpand} style={vcStyles.expandBtn}>
          <Ionicons name="expand-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}

      {card.vibeScore !== undefined && (
        <View style={vcStyles.scoreBadge}>
          <Text style={vcStyles.scoreText}>⚡ {card.vibeScore}</Text>
        </View>
      )}

      {matchPct !== undefined && !previewMode && (
        <View style={vcStyles.matchBadge}>
          <LinearGradient
            colors={["#7C3AED", "#EA580C"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={vcStyles.matchGrad}
          >
            <Text style={vcStyles.matchText}>{matchPct}% Match</Text>
          </LinearGradient>
        </View>
      )}

      {previewMode && (
        <View style={vcStyles.previewBadge}>
          <LinearGradient
            colors={["rgba(0,0,0,0.6)", "rgba(0,0,0,0.6)"]}
            style={vcStyles.previewGrad}
          >
            <Ionicons name="eye-outline" size={12} color="rgba(255,255,255,0.7)" />
            <Text style={vcStyles.previewText}>Preview</Text>
          </LinearGradient>
        </View>
      )}

      <View style={vcStyles.cardBottom}>
        <View style={vcStyles.cardNameRow}>
          <Text style={vcStyles.cardName}>
            {card.name}{card.age ? `, ${card.age}` : ""}
          </Text>
          {card.distance ? (
            <View style={vcStyles.distancePill}>
              <Ionicons name="location" size={11} color="#7C3AED" />
              <Text style={vcStyles.distanceText}>{card.distance}</Text>
            </View>
          ) : card.vibe ? (
            <View style={[vcStyles.distancePill, { backgroundColor: "rgba(124,58,237,0.3)" }]}>
              <Text style={[vcStyles.distanceText, { color: "#A78BFA" }]}>{card.vibe}</Text>
            </View>
          ) : null}
        </View>

        <View style={vcStyles.cardGoalRow}>
          {!!card.goal && <GoalPill goal={card.goal} />}
          {!!myGoals?.length && !!card.goal && myGoals.includes(card.goal) && (
            <View style={vcStyles.sameGoalBadge}>
              <Text style={vcStyles.sameGoalText}>🎯 Same goals</Text>
            </View>
          )}
        </View>

        {!!card.bio && (
          <Text style={vcStyles.cardBio} numberOfLines={2}>{card.bio}</Text>
        )}

        {card.interests.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={vcStyles.interestRow}>
              {card.interests.map((int) => (
                <View
                  key={int}
                  style={[
                    vcStyles.interestTag,
                    (card.matchInterests ?? []).includes(int) && vcStyles.interestTagMatch,
                  ]}
                >
                  <Text style={vcStyles.interestText}>{int}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </>
  );
}

const vcStyles = StyleSheet.create({
  tapZoneLeft: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "40%",
    bottom: 0,
  },
  tapZoneRight: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "40%",
    bottom: 0,
  },
  photoBars: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    gap: 4,
  },
  photoBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  photoBarSeen: {
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  photoBarActive: {
    backgroundColor: "#ffffff",
    opacity: 1,
  },
  expandBtn: {
    position:        "absolute",
    top:             16,
    left:            16,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius:    22,
    padding:         8,
  },
  scoreBadge: {
    position:        "absolute",
    top:             16,
    right:           16,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius:    10,
  },
  scoreText: {
    color:       "#FBBF24",
    fontFamily:  "Poppins_700Bold",
    fontSize:    12,
  },
  matchBadge: {
    position: "absolute",
    top:      56,
    right:    16,
  },
  matchGrad: {
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      20,
  },
  matchText: {
    color:      "#fff",
    fontSize:   13,
    fontFamily: "Poppins_700Bold",
  },
  previewBadge: {
    position: "absolute",
    top:      56,
    right:    16,
  },
  previewGrad: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               4,
    paddingHorizontal: 10,
    paddingVertical:   5,
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       "rgba(255,255,255,0.2)",
  },
  previewText: {
    color:      "rgba(255,255,255,0.7)",
    fontSize:   12,
    fontFamily: "Poppins_600SemiBold",
  },
  cardBottom: {
    position: "absolute",
    bottom:   0,
    left:     0,
    right:    0,
    padding:  22,
    gap:      8,
  },
  cardNameRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           8,
  },
  cardGoalRow: {
    flexDirection: "row",
    alignItems:    "center",
    gap:           6,
  },
  sameGoalBadge: {
    backgroundColor: "rgba(234,179,8,0.25)",
    borderRadius:    8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth:     1,
    borderColor:     "rgba(234,179,8,0.5)",
  },
  sameGoalText: {
    color:      "#EAB308",
    fontFamily: "Poppins_600SemiBold",
    fontSize:   11,
  },
  cardName: {
    color:      "#fff",
    fontSize:   26,
    fontFamily: "Poppins_700Bold",
  },
  distancePill: {
    flexDirection:     "row",
    alignItems:        "center",
    gap:               3,
    backgroundColor:   "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      10,
  },
  distanceText: {
    color:      "#fff",
    fontSize:   12,
    fontFamily: "Poppins_500Medium",
  },
  cardBio: {
    color:      "rgba(255,255,255,0.88)",
    fontSize:   14,
    fontFamily: "Poppins_400Regular",
    lineHeight: 20,
  },
  interestRow: {
    flexDirection: "row",
    gap:           7,
  },
  interestTag: {
    backgroundColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius:    10,
    borderWidth:     0.5,
    borderColor:     "rgba(255,255,255,0.3)",
  },
  interestTagMatch: {
    backgroundColor: "rgba(124,58,237,0.65)",
    borderColor:     "#A78BFA",
  },
  interestText: {
    color:      "#fff",
    fontSize:   12,
    fontFamily: "Poppins_600SemiBold",
  },
});
