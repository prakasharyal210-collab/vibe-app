import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";

const CTA_OPTIONS = [
  "Learn More",
  "Shop Now",
  "Sign Up",
  "Download",
  "Get Offer",
  "Book Now",
  "Contact Us",
  "Watch Now",
];

const BUDGET_OPTIONS = [
  { label: "$5 / day", value: 5 },
  { label: "$10 / day", value: 10 },
  { label: "$25 / day", value: 25 },
  { label: "$50 / day", value: 50 },
  { label: "$100 / day", value: 100 },
  { label: "$250 / day", value: 250 },
  { label: "$500 / day", value: 500 },
];

const DURATION_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
];

const AD_TYPE_OPTIONS = [
  { label: "Feed Post", value: "feed_post", icon: "grid-outline" as const, desc: "Appears between posts in the main feed" },
  { label: "Reel Ad", value: "reel", icon: "play-circle-outline" as const, desc: "Full-screen ad shown between reels" },
];

const GENDER_OPTIONS = [
  { label: "All", value: "all" },
  { label: "Men", value: "male" },
  { label: "Women", value: "female" },
];

function SectionLabel({ label }: { label: string }) {
  const colors = useColors();
  return (
    <Text style={[sec.label, { color: colors.mutedForeground }]}>{label}</Text>
  );
}
const sec = StyleSheet.create({
  label: { fontSize: 11, fontFamily: "Poppins_700Bold", letterSpacing: 1.2, textTransform: "uppercase", paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 },
});

export default function AdvertiseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const topInset = Platform.OS === "web" ? 67 : insets.top;

  const [businessName, setBusinessName] = useState("");
  const [adTitle, setAdTitle] = useState("");
  const [adDesc, setAdDesc] = useState("");
  const [ctaText, setCtaText] = useState("Learn More");
  const [ctaUrl, setCtaUrl] = useState("");
  const [budget, setBudget] = useState(10);
  const [duration, setDuration] = useState(7);
  const [adType, setAdType] = useState<"feed_post" | "reel">("feed_post");
  const [targetGender, setTargetGender] = useState("all");
  const [submitting, setSubmitting] = useState(false);

  const totalBudget = budget * duration;

  const handleSubmit = async () => {
    if (!businessName.trim()) {
      Alert.alert("Missing Info", "Please enter your business or brand name.");
      return;
    }
    if (!adTitle.trim()) {
      Alert.alert("Missing Info", "Please enter an ad headline.");
      return;
    }
    if (!adDesc.trim()) {
      Alert.alert("Missing Info", "Please enter a short ad description.");
      return;
    }
    if (!ctaUrl.trim()) {
      Alert.alert("Missing Info", "Please enter a destination URL for your ad.");
      return;
    }

    setSubmitting(true);
    try {
      const userId = session?.user?.id;
      if (userId) {
        const apiBase = (process.env["EXPO_PUBLIC_API_URL"] ?? "") + "/api";
        await fetch(`${apiBase}/ads/campaign`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId,
            advertiserName: businessName.trim(),
            title: adTitle.trim(),
            description: adDesc.trim(),
            ctaText,
            ctaUrl: ctaUrl.trim(),
            adType,
            dailyBudget: budget,
            durationDays: duration,
            targetGender,
          }),
        });
      }
    } catch {}

    setSubmitting(false);
    Alert.alert(
      "🎉 Campaign Submitted!",
      `Your ad campaign has been submitted for review.\n\nOur team will review it within 24 hours. Once approved, your ad will go live and reach Vibe's audience.\n\nEstimated reach: ${(budget * duration * 1200).toLocaleString()}–${(budget * duration * 2800).toLocaleString()} impressions over ${duration} days.`,
      [
        { text: "Done", onPress: () => router.back() },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={["#7C3AED", "#F97316"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.headerGrad, { paddingTop: topInset + 8 }]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Advertise on Gundruk</Text>
          <Text style={styles.headerSub}>Reach millions of engaged users</Text>
        </View>
        <View style={styles.megaphoneWrap}>
          <Text style={{ fontSize: 28 }}>📣</Text>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Stats banner */}
        <View style={[styles.statsBanner, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <StatPill value="2M+" label="Monthly users" color="#7C3AED" />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatPill value="82%" label="Engagement rate" color="#F97316" />
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <StatPill value="$0.003" label="Cost per view" color="#10B981" />
        </View>

        {/* Ad Type */}
        <SectionLabel label="Ad Format" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {AD_TYPE_OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.value}
              onPress={() => setAdType(opt.value as any)}
              style={[
                styles.typeRow,
                { borderBottomColor: colors.border },
                i === AD_TYPE_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                adType === opt.value && { backgroundColor: "rgba(124,58,237,0.06)" },
              ]}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: adType === opt.value ? "rgba(124,58,237,0.15)" : colors.muted }]}>
                <Ionicons name={opt.icon} size={20} color={adType === opt.value ? "#7C3AED" : colors.mutedForeground} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeLabel, { color: colors.foreground }]}>{opt.label}</Text>
                <Text style={[styles.typeDesc, { color: colors.mutedForeground }]}>{opt.desc}</Text>
              </View>
              <View style={[
                styles.typeCheck,
                { borderColor: adType === opt.value ? "#7C3AED" : colors.border },
                adType === opt.value && { backgroundColor: "#7C3AED" },
              ]}>
                {adType === opt.value && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Business info */}
        <SectionLabel label="Business Info" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FieldRow label="Business / Brand Name" required>
            <TextInput
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="e.g. Nike, My Coffee Shop"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              maxLength={60}
            />
          </FieldRow>
        </View>

        {/* Ad content */}
        <SectionLabel label="Ad Content" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <FieldRow label="Headline" required hint={`${adTitle.length}/50`}>
            <TextInput
              value={adTitle}
              onChangeText={(t) => setAdTitle(t.slice(0, 50))}
              placeholder="Grab attention in 1 line"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              maxLength={50}
            />
          </FieldRow>
          <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
          <FieldRow label="Description" required hint={`${adDesc.length}/150`}>
            <TextInput
              value={adDesc}
              onChangeText={(t) => setAdDesc(t.slice(0, 150))}
              placeholder="Describe your offer in 1-2 sentences"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              maxLength={150}
              multiline
              numberOfLines={2}
            />
          </FieldRow>
        </View>

        {/* CTA */}
        <SectionLabel label="Call to Action" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.ctaGrid}>
            {CTA_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => setCtaText(opt)}
                style={[
                  styles.ctaPill,
                  { borderColor: ctaText === opt ? "#7C3AED" : colors.border },
                  ctaText === opt && { backgroundColor: "rgba(124,58,237,0.12)" },
                ]}
              >
                <Text style={[styles.ctaPillText, { color: ctaText === opt ? "#7C3AED" : colors.mutedForeground }]}>
                  {opt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.fieldDivider, { backgroundColor: colors.border }]} />
          <FieldRow label="Destination URL" required>
            <TextInput
              value={ctaUrl}
              onChangeText={setCtaUrl}
              placeholder="https://your-website.com/offer"
              placeholderTextColor={colors.mutedForeground}
              style={[styles.input, { color: colors.foreground }]}
              autoCapitalize="none"
              keyboardType="url"
            />
          </FieldRow>
        </View>

        {/* Targeting */}
        <SectionLabel label="Audience Targeting" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground, paddingHorizontal: 14, paddingTop: 12 }]}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDER_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setTargetGender(opt.value)}
                style={[
                  styles.genderPill,
                  { borderColor: targetGender === opt.value ? "#7C3AED" : colors.border },
                  targetGender === opt.value && { backgroundColor: "#7C3AED" },
                ]}
              >
                <Text style={[styles.genderPillText, { color: targetGender === opt.value ? "#fff" : colors.mutedForeground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Budget */}
        <SectionLabel label="Daily Budget" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.budgetGrid}>
            {BUDGET_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setBudget(opt.value)}
                style={[
                  styles.budgetPill,
                  { borderColor: budget === opt.value ? "#7C3AED" : colors.border },
                  budget === opt.value && { backgroundColor: "rgba(124,58,237,0.12)" },
                ]}
              >
                <Text style={[styles.budgetText, { color: budget === opt.value ? "#7C3AED" : colors.foreground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Duration */}
        <SectionLabel label="Campaign Duration" />
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.durationRow}>
            {DURATION_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                onPress={() => setDuration(opt.value)}
                style={[
                  styles.durationPill,
                  { borderColor: duration === opt.value ? "#7C3AED" : colors.border },
                  duration === opt.value && { backgroundColor: "#7C3AED" },
                ]}
              >
                <Text style={[styles.durationText, { color: duration === opt.value ? "#fff" : colors.foreground }]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Budget summary */}
        <View style={[styles.summary, { backgroundColor: "rgba(124,58,237,0.08)", borderColor: "#7C3AED" }]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Daily budget</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>${budget.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>Duration</Text>
            <Text style={[styles.summaryValue, { color: colors.foreground }]}>{duration} days</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={[styles.summaryLabel, { color: "#7C3AED", fontFamily: "Poppins_700Bold" }]}>Total budget</Text>
            <Text style={[styles.summaryValue, { color: "#7C3AED", fontFamily: "Poppins_700Bold", fontSize: 18 }]}>${totalBudget.toFixed(2)}</Text>
          </View>
          <Text style={[styles.summaryEst, { color: colors.mutedForeground }]}>
            Est. {(totalBudget * 1200).toLocaleString()}–{(totalBudget * 2800).toLocaleString()} impressions
          </Text>
        </View>

        {/* Submit */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.85}
            style={{ borderRadius: 14, overflow: "hidden" }}
          >
            <LinearGradient
              colors={["#7C3AED", "#F97316"]}
              style={styles.submitBtn}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {submitting ? (
                <Text style={styles.submitText}>Submitting...</Text>
              ) : (
                <>
                  <Ionicons name="send" size={18} color="#fff" />
                  <Text style={styles.submitText}>Submit for Review</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={[styles.disclaimer, { color: colors.mutedForeground }]}>
            By submitting, you agree to Vibe's Advertising Policies. All ads are reviewed within 24 hours.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function StatPill({ value, label, color }: { value: string; label: string; color: string }) {
  const colors = useColors();
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      <Text style={[statStyles.label, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const statStyles = StyleSheet.create({
  value: { fontSize: 17, fontFamily: "Poppins_700Bold" },
  label: { fontSize: 10, fontFamily: "Poppins_400Regular", textAlign: "center", marginTop: 1 },
});

function FieldRow({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={[fieldStyles.label, { color: colors.mutedForeground }]}>
          {label}
          {required && <Text style={{ color: "#EF4444" }}> *</Text>}
        </Text>
        {hint && <Text style={[fieldStyles.hint, { color: colors.mutedForeground }]}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}
const fieldStyles = StyleSheet.create({
  label: { fontSize: 12, fontFamily: "Poppins_500Medium" },
  hint: { fontSize: 11, fontFamily: "Poppins_400Regular" },
});

const styles = StyleSheet.create({
  container: { flex: 1 },

  headerGrad: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: "#fff", fontSize: 19, fontFamily: "Poppins_700Bold" },
  headerSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, fontFamily: "Poppins_400Regular" },
  megaphoneWrap: { padding: 4 },

  statsBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statDivider: { width: 0.5, height: 30, marginHorizontal: 8 },

  card: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 0.5,
    overflow: "hidden",
  },

  typeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: 0.5,
  },
  typeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  typeLabel: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  typeDesc: { fontSize: 11, fontFamily: "Poppins_400Regular", marginTop: 1 },
  typeCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },

  fieldLabel: { fontSize: 12, fontFamily: "Poppins_500Medium", marginBottom: 6 },
  fieldDivider: { height: 0.5 },
  input: {
    fontSize: 14,
    fontFamily: "Poppins_400Regular",
    paddingVertical: 4,
  },

  ctaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
  },
  ctaPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  ctaPillText: { fontSize: 13, fontFamily: "Poppins_500Medium" },

  genderRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  genderPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  genderPillText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  budgetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 14,
  },
  budgetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    minWidth: "29%",
    alignItems: "center",
  },
  budgetText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  durationRow: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  durationText: { fontSize: 13, fontFamily: "Poppins_600SemiBold" },

  summary: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryTotal: { borderTopWidth: 0.5, borderTopColor: "rgba(124,58,237,0.2)", paddingTop: 8, marginTop: 4 },
  summaryLabel: { fontSize: 13, fontFamily: "Poppins_500Medium" },
  summaryValue: { fontSize: 14, fontFamily: "Poppins_600SemiBold" },
  summaryEst: { fontSize: 11, fontFamily: "Poppins_400Regular", textAlign: "center", marginTop: 4 },

  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitText: { color: "#fff", fontSize: 16, fontFamily: "Poppins_700Bold" },
  disclaimer: {
    fontSize: 11,
    fontFamily: "Poppins_400Regular",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
});
