import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
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
import { UserAvatar } from "@/components/UserAvatar";
import { useColors } from "@/hooks/useColors";
import { clearSearchHistory, deleteSearchHistoryItem, loadSearchHistory, saveSearchHistory, searchHashtags, searchProfiles, SearchHistoryItem } from "@/lib/db";
import { Profile, Hashtag, formatCount } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

const { width: W } = Dimensions.get("window");
const GRID_W = (W - 48) / 2;

type Tab = "top" | "accounts" | "hashtags" | "reels";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("top");
  const [filteredAccounts, setFilteredAccounts] = useState<Profile[]>([]);
  const [filteredHashtags, setFilteredHashtags] = useState<Hashtag[]>([]);
  const [trendingHashtags, setTrendingHashtags] = useState<Hashtag[]>([]);
  const [suggestedAccounts, setSuggestedAccounts] = useState<Profile[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);

  useEffect(() => {
    searchProfiles("").then(setSuggestedAccounts).catch(() => {});
    searchHashtags("").then(setTrendingHashtags).catch(() => {});
    if (session?.user?.id) {
      loadSearchHistory(session.user.id).then(setSearchHistory).catch(() => {});
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchProfiles(query).then(setFilteredAccounts).catch(() => {});
      searchHashtags(query).then(setFilteredHashtags).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSearchSubmit = () => {
    const q = query.trim();
    if (!q || !session?.user?.id) return;
    saveSearchHistory(session.user.id, q).then(() => {
      const newItem: SearchHistoryItem = { id: Date.now().toString(), query: q, created_at: new Date().toISOString() };
      setSearchHistory((prev) => [newItem, ...prev.filter((h) => h.query !== q)].slice(0, 20));
    }).catch(() => {});
  };

  const handleClearHistory = () => {
    setSearchHistory([]);
    if (session?.user?.id) clearSearchHistory(session.user.id).catch(() => {});
  };

  const handleDeleteHistoryItem = (item: SearchHistoryItem) => {
    setSearchHistory((prev) => prev.filter((h) => h.id !== item.id));
    deleteSearchHistoryItem(item.id).catch(() => {});
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "top", label: "Top" },
    { key: "accounts", label: "Accounts" },
    { key: "hashtags", label: "Hashtags" },
    { key: "reels", label: "Reels" },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.foreground} />
        </TouchableOpacity>
        <View
          style={[
            styles.searchBar,
            { backgroundColor: colors.muted, borderColor: colors.border },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
          <TextInput
            ref={inputRef}
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search people, hashtags, reels..."
            placeholderTextColor={colors.mutedForeground}
            style={[styles.searchInput, { color: colors.foreground }]}
            autoCapitalize="none"
            returnKeyType="search"
          onSubmitEditing={handleSearchSubmit}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {query.length > 0 && (
        <View style={styles.tabRow}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.tab,
                activeTab === tab.key && { borderBottomColor: "#7C3AED", borderBottomWidth: 2 },
              ]}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: activeTab === tab.key ? "#7C3AED" : colors.mutedForeground },
                  activeTab === tab.key && { fontFamily: "Poppins_700Bold" },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {query.length === 0 ? (
          <>
            {searchHistory.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionRow}>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>🕐 Recent</Text>
                  <TouchableOpacity onPress={handleClearHistory}>
                    <Text style={{ color: "#7C3AED", fontSize: 13, fontFamily: "Poppins_500Medium" }}>Clear all</Text>
                  </TouchableOpacity>
                </View>
                {searchHistory.slice(0, 8).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.historyRow, { borderBottomColor: colors.border }]}
                    onPress={() => setQuery(item.query)}
                  >
                    <Ionicons name="time-outline" size={16} color={colors.mutedForeground} />
                    <Text style={[styles.historyText, { color: colors.foreground }]}>{item.query}</Text>
                    <TouchableOpacity onPress={() => handleDeleteHistoryItem(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close" size={14} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                🔥 Trending
              </Text>
              <View style={styles.hashtagGrid}>
                {trendingHashtags.map((h, i) => (
                  <TouchableOpacity
                    key={h.tag}
                    style={[styles.hashtagCard, { width: GRID_W }]}
                    onPress={() => setQuery(h.tag)}
                  >
                    <Image source={{ uri: h.image }} style={styles.hashtagImage} />
                    <LinearGradient
                      colors={["transparent", "rgba(0,0,0,0.8)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.hashtagInfo}>
                      <Text style={styles.hashtagTag}>#{h.tag}</Text>
                      <Text style={styles.hashtagCount}>{h.count}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={[styles.section, { borderTopWidth: 0.5, borderTopColor: colors.border, paddingTop: 16 }]}>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                👥 Suggested Accounts
              </Text>
              {suggestedAccounts.slice(0, 4).map((account) => (
                <AccountRow key={account.id} account={account} colors={colors} />
              ))}
            </View>
          </>
        ) : (
          <>
            {(activeTab === "top" || activeTab === "accounts") && filteredAccounts.length > 0 && (
              <View style={styles.section}>
                {activeTab === "top" && (
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Accounts</Text>
                )}
                {filteredAccounts.map((account) => (
                  <AccountRow key={account.id} account={account} colors={colors} />
                ))}
              </View>
            )}

            {(activeTab === "top" || activeTab === "hashtags") && filteredHashtags.length > 0 && (
              <View style={[styles.section, { borderTopWidth: activeTab === "top" ? 0.5 : 0, borderTopColor: colors.border, paddingTop: activeTab === "top" ? 16 : 0 }]}>
                {activeTab === "top" && (
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Hashtags</Text>
                )}
                {filteredHashtags.map((h) => (
                  <TouchableOpacity
                    key={h.tag}
                    style={styles.hashtagRow}
                    onPress={() => setQuery(h.tag)}
                  >
                    <View style={[styles.hashIconCircle, { backgroundColor: colors.muted }]}>
                      <Text style={styles.hashIcon}>#</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.hashTagText, { color: colors.foreground }]}>#{h.tag}</Text>
                      <Text style={[styles.hashCountText, { color: colors.mutedForeground }]}>{h.count}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {(activeTab === "top" || activeTab === "reels") && (
              <View style={[styles.section, { paddingTop: 16 }]}>
                {activeTab === "top" && (
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Reels</Text>
                )}
                <View style={styles.reelGrid}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.reelThumb, { width: (W - 36) / 3 }]}
                    >
                      <Image
                        source={{ uri: `https://picsum.photos/seed/sr${i}${query}/200/300` }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                      <LinearGradient
                        colors={["transparent", "rgba(0,0,0,0.5)"]}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={styles.reelViews}>
                        <Ionicons name="play" size={10} color="#fff" />
                        <Text style={styles.reelViewCount}>{(Math.random() * 900 + 100).toFixed(0)}k</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {filteredAccounts.length === 0 && filteredHashtags.length === 0 && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsEmoji}>🔍</Text>
                <Text style={[styles.noResultsText, { color: colors.foreground }]}>
                  No results for "{query}"
                </Text>
                <Text style={[styles.noResultsSub, { color: colors.mutedForeground }]}>
                  Try a different search term
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function AccountRow({ account, colors }: { account: any; colors: any }) {
  const [following, setFollowing] = useState(false);

  return (
    <View style={styles.accountRow}>
      <TouchableOpacity onPress={() => router.push(`/profile/${account.username}` as any)} activeOpacity={0.8}>
        <UserAvatar username={account.username} size={46} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.accountInfo} onPress={() => router.push(`/profile/${account.username}` as any)} activeOpacity={0.8}>
        <View style={styles.accountNameRow}>
          <Text style={[styles.accountName, { color: colors.foreground }]}>
            {account.username}
          </Text>
          {account.is_verified && (
            <Ionicons name="checkmark-circle" size={14} color="#7C3AED" />
          )}
        </View>
        <Text style={[styles.accountBio, { color: colors.mutedForeground }]} numberOfLines={1}>
          {account.bio}
        </Text>
        <Text style={[styles.accountFollowers, { color: colors.mutedForeground }]}>
          {formatCount(account.followers_count ?? 0)} followers
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setFollowing((f) => !f)}
        style={[
          styles.followBtn,
          following
            ? { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border }
            : { backgroundColor: "#7C3AED" },
        ]}
      >
        <Text
          style={[
            styles.followBtnText,
            { color: following ? colors.foreground : "#fff" },
          ]}
        >
          {following ? "Following" : "Follow"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  backBtn: { padding: 2 },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderRadius: 14,
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "rgba(255,255,255,0.1)",
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Poppins_500Medium",
  },
  section: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Poppins_700Bold",
    marginBottom: 14,
  },
  hashtagGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  hashtagCard: {
    height: 110,
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  hashtagImage: {
    width: "100%",
    height: "100%",
  },
  hashtagInfo: {
    position: "absolute",
    bottom: 8,
    left: 8,
  },
  hashtagTag: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Poppins_700Bold",
  },
  hashtagCount: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  accountInfo: { flex: 1, gap: 2 },
  accountNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  accountName: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  accountBio: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  accountFollowers: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
  },
  followBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 10,
  },
  followBtnText: {
    fontSize: 13,
    fontFamily: "Poppins_600SemiBold",
  },
  hashtagRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  hashIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  hashIcon: {
    color: "#7C3AED",
    fontSize: 22,
    fontFamily: "Poppins_700Bold",
  },
  hashTagText: {
    fontSize: 14,
    fontFamily: "Poppins_600SemiBold",
  },
  hashCountText: {
    fontSize: 12,
    fontFamily: "Poppins_400Regular",
  },
  reelGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  reelThumb: {
    height: 160,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
  },
  reelViews: {
    position: "absolute",
    bottom: 6,
    left: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  reelViewCount: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Poppins_600SemiBold",
  },
  noResults: {
    alignItems: "center",
    paddingTop: 80,
    gap: 10,
  },
  noResultsEmoji: { fontSize: 48 },
  noResultsText: {
    fontSize: 17,
    fontFamily: "Poppins_600SemiBold",
    textAlign: "center",
  },
  noResultsSub: {
    fontSize: 13,
    fontFamily: "Poppins_400Regular",
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: 0.5,
    gap: 10,
  },
  historyText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
  },
});
