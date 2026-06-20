import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { HighlightViewer, Highlight } from "@/components/HighlightViewer";
import { fetchHighlights } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";

export default function HighlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [highlight, setHighlight] = useState<Highlight | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const uid = session?.user?.id;
      if (uid) {
        const highlights = await fetchHighlights(uid);
        const found = highlights.find((h) => h.id === id);
        if (found) {
          setHighlight({
            id: found.id,
            label: found.title,
            image: found.cover_url ?? `https://picsum.photos/seed/${found.id}/200/200`,
            username: session?.user?.email?.split("@")[0] ?? "user",
          });
          return;
        }
      }
      setHighlight({
        id,
        label: "Highlight",
        image: `https://picsum.photos/seed/${id}/200/200`,
        username: "user",
      });
    })();
  }, [id, session?.user?.id]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <HighlightViewer
        highlight={highlight}
        visible={!!highlight}
        onClose={() => router.back()}
      />
    </View>
  );
}
