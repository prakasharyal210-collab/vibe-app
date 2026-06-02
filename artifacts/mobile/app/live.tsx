import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UserAvatar } from "@/components/UserAvatar";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const { width: W, height: H } = Dimensions.get("window");

interface LiveComment {
  id: string;
  username: string;
  text: string;
  type: "comment" | "gift" | "join";
  gift?: string;
}

interface Gift {
  id: string;
  icon: string;
  name: string;
  coins: number;
  color: string;
}

const GIFTS: Gift[] = [
  { id: "g1", icon: "💎", name: "Diamond", coins: 500, color: "#818CF8" },
  { id: "g2", icon: "🌹", name: "Rose", coins: 10, color: "#F43F5E" },
  { id: "g3", icon: "🦁", name: "Lion", coins: 199, color: "#F97316" },
  { id: "g4", icon: "🚀", name: "Rocket", coins: 99, color: "#7C3AED" },
  { id: "g5", icon: "⭐", name: "Star", coins: 5, color: "#EAB308" },
  { id: "g6", icon: "🎉", name: "Party", coins: 25, color: "#10B981" },
];

const FAKE_VIEWERS = ["luna_sky", "marcus_vibe", "zoe.creates", "kai_adventures", "nadia.official", "alex.w", "maya_art", "jay_c"];
const FAKE_COMMENTS = [
  "This is so good! 🔥", "Loving this vibe ✨", "Queen!! 👑", "Can't stop watching",
  "Drop the link!", "You're amazing!", "First time here 💜", "Fire content 🎯",
  "How long have you been doing this?", "You should go viral!", "Following now!",
];

function GiftAnimation({ gift, onDone }: { gift: { id: string; icon: string; y: Animated.Value }; onDone: () => void }) {
  useEffect(() => {
    Animated.timing(gift.y, { toValue: -200, duration: 2000, useNativeDriver: true }).start(onDone);
  }, []);
  return (
    <Animated.View style={[styles.giftFloat, { transform: [{ translateY: gift.y }] }]}>
      <Text style={{ fontSize: 32 }}>{gift.icon}</Text>
    </Animated.View>
  );
}

export default function LiveScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const username = session?.user?.email?.split("@")[0] ?? "you";

  const [viewers, setViewers] = useState(12);
  const [totalCoins, setTotalCoins] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<LiveComment[]>([
    { id: "c0", username: "luna_sky", text: "Tuned in! 💜", type: "join" },
  ]);
  const [showGifts, setShowGifts] = useState(false);
  const [floatingGifts, setFloatingGifts] = useState<{ id: string; icon: string; y: Animated.Value }[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const topInset = Platform.OS === "web" ? 16 : insets.top;

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  useEffect(() => {
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    const viewerTimer = setInterval(() => {
      setViewers((v) => v + Math.floor(Math.random() * 3));
    }, 4000);
    const commentTimer = setInterval(() => {
      const user = FAKE_VIEWERS[Math.floor(Math.random() * FAKE_VIEWERS.length)];
      const text = FAKE_COMMENTS[Math.floor(Math.random() * FAKE_COMMENTS.length)];
      const newComment: LiveComment = { id: Date.now().toString(), username: user, text, type: "comment" };
      setComments((c) => [...c.slice(-30), newComment]);
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 3500);
    return () => { clearInterval(timer); clearInterval(viewerTimer); clearInterval(commentTimer); };
  }, []);

  const sendGift = (gift: Gift) => {
    setShowGifts(false);
    setTotalCoins((c) => c + gift.coins);
    const y = new Animated.Value(0);
    const id = Date.now().toString();
    setFloatingGifts((g) => [...g, { id, icon: gift.icon, y }]);
    const newComment: LiveComment = {
      id, username: "you", text: `Sent a ${gift.name} ${gift.icon}!`, type: "gift", gift: gift.icon,
    };
    setComments((c) => [...c.slice(-30), newComment]);
  };

  const sendComment = () => {
    if (!comment.trim()) return;
    const newComment: LiveComment = { id: Date.now().toString(), username: "you", text: comment.trim(), type: "comment" };
    setComments((c) => [...c.slice(-30), newComment]);
    setComment("");
    flatListRef.current?.scrollToEnd({ animated: true });
  };

  const endLive = () => {
    Alert.alert("End Live?", `You went live for ${formatTime(elapsed)} and earned ${totalCoins} coins!`, [
      { text: "Keep Going" },
      { text: "End Live", style: "destructive", onPress: () => router.back() },
    ]);
  };

  return (
    <View style={styles.container}>
      <Image source={{ uri: "https://picsum.photos/seed/live/450/900" }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      <LinearGradient colors={["rgba(0,0,0,0.55)", "transparent"]} style={[styles.topGrad, { height: 160 }]} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.85)"]} style={[styles.bottomGrad, { height: 400 }]} />

      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity onPress={endLive} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.liveBadgeRow}>
          <View style={styles.liveBadge}>
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
          <Text style={styles.timerText}>{formatTime(elapsed)}</Text>
        </View>
        <View style={styles.viewersRow}>
          <Ionicons name="eye" size={14} color="#fff" />
          <Text style={styles.viewersText}>{viewers.toLocaleString()}</Text>
        </View>
        <TouchableOpacity style={styles.shareBtn} onPress={() => Alert.alert("Shared!", "Live shared to your followers")}>
          <Ionicons name="share-social-outline" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {totalCoins > 0 && (
        <View style={[styles.coinsBar, { top: topInset + 60 }]}>
          <LinearGradient colors={["#7C3AED", "#EA580C"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.coinsGrad}>
            <Text style={styles.coinsIcon}>🪙</Text>
            <Text style={styles.coinsText}>{totalCoins} coins received</Text>
          </LinearGradient>
        </View>
      )}

      {floatingGifts.map((g) => (
        <GiftAnimation key={g.id} gift={g} onDone={() => setFloatingGifts((list) => list.filter((x) => x.id !== g.id))} />
      ))}

      <View style={styles.commentsList}>
        <FlatList
          ref={flatListRef}
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={[styles.commentRow, item.type === "gift" && styles.giftComment]}>
              <UserAvatar username={item.username} size={24} />
              <View style={styles.commentBubble}>
                <Text style={styles.commentUser}>{item.username} </Text>
                <Text style={styles.commentText}>{item.text}</Text>
              </View>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.bottomBar}>
          <View style={styles.commentInputRow}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Say something..."
              placeholderTextColor="rgba(255,255,255,0.5)"
              style={styles.commentInput}
              onSubmitEditing={sendComment}
              returnKeyType="send"
            />
            <TouchableOpacity onPress={sendComment} style={styles.sendBtn}>
              <Ionicons name="send" size={18} color="#7C3AED" />
            </TouchableOpacity>
          </View>
          <View style={styles.liveActions}>
            <TouchableOpacity onPress={() => setShowGifts((s) => !s)} style={styles.liveActionBtn}>
              <Text style={styles.liveActionEmoji}>🎁</Text>
              <Text style={styles.liveActionLabel}>Gifts</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.liveActionBtn} onPress={() => Alert.alert("Viewers", `${viewers} people are watching`)}>
              <Ionicons name="people" size={22} color="#fff" />
              <Text style={styles.liveActionLabel}>{viewers}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={endLive} style={[styles.endLiveBtn]}>
              <LinearGradient colors={["#EF4444", "#DC2626"]} style={styles.endLiveGrad}>
                <Text style={styles.endLiveText}>End</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {showGifts && (
        <View style={styles.giftsPanel}>
          <View style={styles.giftsPanelInner}>
            <Text style={styles.giftsPanelTitle}>🎁 Send a Gift</Text>
            <View style={styles.giftsGrid}>
              {GIFTS.map((g) => (
                <TouchableOpacity key={g.id} onPress={() => sendGift(g)} style={styles.giftItem}>
                  <Text style={styles.giftEmoji}>{g.icon}</Text>
                  <Text style={styles.giftName}>{g.name}</Text>
                  <View style={styles.giftCoins}>
                    <Text style={styles.giftCoinIcon}>🪙</Text>
                    <Text style={styles.giftCoinText}>{g.coins}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topGrad: { position: "absolute", top: 0, left: 0, right: 0 },
  bottomGrad: { position: "absolute", bottom: 0, left: 0, right: 0 },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 10 },
  closeBtn: { padding: 4 },
  liveBadgeRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  liveBadge: { backgroundColor: "#EF4444", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  liveBadgeText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_700Bold", letterSpacing: 1 },
  timerText: { color: "#fff", fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  viewersRow: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.4)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  viewersText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  shareBtn: { padding: 6, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: 20 },
  coinsBar: { position: "absolute", right: 14, left: 14 },
  coinsGrad: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  coinsIcon: { fontSize: 16 },
  coinsText: { color: "#fff", fontSize: 13, fontFamily: "Poppins_600SemiBold" },
  giftFloat: { position: "absolute", bottom: 200, left: W / 2 - 20 },
  commentsList: { position: "absolute", bottom: 130, left: 10, right: 80, maxHeight: 220 },
  commentRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  giftComment: { opacity: 0.95 },
  commentBubble: { flexDirection: "row", flexWrap: "wrap", backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, maxWidth: W * 0.65 },
  commentUser: { color: "#A78BFA", fontSize: 12, fontFamily: "Poppins_700Bold" },
  commentText: { color: "#fff", fontSize: 12, fontFamily: "Poppins_400Regular" },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingBottom: Platform.OS === "web" ? 90 : 32 },
  commentInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  commentInput: { flex: 1, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: "#fff", fontSize: 14, fontFamily: "Poppins_400Regular", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  sendBtn: { backgroundColor: "rgba(124,58,237,0.3)", borderRadius: 20, width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  liveActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveActionBtn: { alignItems: "center", gap: 3 },
  liveActionEmoji: { fontSize: 24 },
  liveActionLabel: { color: "#fff", fontSize: 11, fontFamily: "Poppins_400Regular" },
  endLiveBtn: { borderRadius: 22, overflow: "hidden" },
  endLiveGrad: { paddingHorizontal: 24, paddingVertical: 11 },
  endLiveText: { color: "#fff", fontSize: 15, fontFamily: "Poppins_700Bold" },
  giftsPanel: { position: "absolute", bottom: 0, left: 0, right: 0 },
  giftsPanelInner: { backgroundColor: "rgba(10,10,15,0.97)", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === "web" ? 100 : 40 },
  giftsPanelTitle: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold", marginBottom: 16 },
  giftsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  giftItem: { width: (W - 64) / 3, backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 14, padding: 12, alignItems: "center", gap: 4 },
  giftEmoji: { fontSize: 32 },
  giftName: { color: "#fff", fontSize: 12, fontFamily: "Poppins_500Medium" },
  giftCoins: { flexDirection: "row", alignItems: "center", gap: 3 },
  giftCoinIcon: { fontSize: 12 },
  giftCoinText: { color: "#EAB308", fontSize: 12, fontFamily: "Poppins_700Bold" },
});
