/**
 * Admin Reports Screen — accessible only to the account owner.
 * Protected by a hardcoded admin username check + the ADMIN_SECRET header.
 *
 * Navigate to this screen via: router.push("/admin/reports")
 * (Not exposed in any nav menu — direct URL only for safety)
 */
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

// ─── Hardcoded admin usernames — add yours here ───────────────────────────────
const ADMIN_USERNAMES = ["prakasharyal", "admin", "gundruk_admin"];
const ADMIN_SECRET = "gundruk-admin-2024";

interface Report {
  id: string;
  reporter_id: string;
  target_type: string;
  target_id: string;
  reason: string;
  details?: string;
  status: string;
  created_at: string;
  reviewed_at?: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "#F59E0B",
  reviewed: "#3B82F6",
  actioned: "#10B981",
  dismissed: "#6B7280",
};

export default function AdminReportsScreen() {
  const { session } = useAuth();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const username = (session?.user?.user_metadata?.username ?? "") as string;
  const isAdmin = ADMIN_USERNAMES.includes(username.toLowerCase());

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/moderation/reports`, {
        headers: { "x-admin-secret": ADMIN_SECRET },
      });
      const json = await res.json();
      setReports(json.reports ?? []);
    } catch {
      Alert.alert("Error", "Could not load reports");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    fetchReports();
  }, [isAdmin]);

  const updateStatus = async (id: string, status: string) => {
    setUpdatingId(id);
    try {
      await fetch(`${apiBase}/moderation/reports/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-secret": ADMIN_SECRET },
        body: JSON.stringify({ status }),
      });
      setReports((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
    } catch {
      Alert.alert("Error", "Could not update status");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="lock-closed" size={48} color={colors.mutedForeground} />
        <Text style={{ color: colors.mutedForeground, marginTop: 12, fontSize: 16 }}>Access denied</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 24 }}>
          <Text style={{ color: "#7C3AED", fontSize: 14 }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Header */}
      <View style={{ paddingTop: Platform.OS === "web" ? 16 : insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 12 }}>
          <Ionicons name="arrow-back" size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Poppins_600SemiBold", flex: 1 }}>
          Reports ({reports.filter((r) => r.status === "pending").length} pending)
        </Text>
        <TouchableOpacity onPress={fetchReports}>
          <Ionicons name="refresh" size={22} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color="#7C3AED" size="large" />
        </View>
      ) : reports.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="checkmark-circle-outline" size={48} color="#10B981" />
          <Text style={{ color: colors.mutedForeground, marginTop: 12 }}>No reports yet</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <View style={{ backgroundColor: STATUS_COLOR[item.status] + "22", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginRight: 8 }}>
                  <Text style={{ color: STATUS_COLOR[item.status], fontSize: 11, fontFamily: "Poppins_600SemiBold", textTransform: "uppercase" }}>{item.status}</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{item.target_type} · {new Date(item.created_at).toLocaleDateString()}</Text>
              </View>

              <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Poppins_500Medium", marginBottom: 2 }}>
                Reason: {item.reason}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginBottom: 8 }} numberOfLines={2}>
                Target ID: {item.target_id}
              </Text>

              {item.status === "pending" && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    { label: "Review", status: "reviewed", color: "#3B82F6" },
                    { label: "Action", status: "actioned", color: "#10B981" },
                    { label: "Dismiss", status: "dismissed", color: "#6B7280" },
                  ].map((btn) => (
                    <TouchableOpacity
                      key={btn.status}
                      disabled={updatingId === item.id}
                      onPress={() => updateStatus(item.id, btn.status)}
                      style={{ flex: 1, backgroundColor: btn.color + "22", paddingVertical: 6, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: btn.color + "44" }}
                    >
                      <Text style={{ color: btn.color, fontSize: 12, fontFamily: "Poppins_600SemiBold" }}>
                        {updatingId === item.id ? "…" : btn.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}
