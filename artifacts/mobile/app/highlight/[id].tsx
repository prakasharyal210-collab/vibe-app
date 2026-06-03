import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { HighlightViewer, Highlight } from "@/components/HighlightViewer";
import { MOCK_HIGHLIGHTS } from "@/lib/supabase";

export default function HighlightScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [highlight, setHighlight] = useState<Highlight | null>(null);

  useEffect(() => {
    if (!id) return;
    const found = MOCK_HIGHLIGHTS.find((h) => h.id === id);
    if (found) {
      setHighlight({ ...found, username: "your_vibe" });
    } else {
      setHighlight({ id, label: "Highlight", image: `https://picsum.photos/seed/${id}/200/200`, username: "user" });
    }
  }, [id]);

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
