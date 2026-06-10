import { Redirect } from "expo-router";
import React from "react";

// Reels is the public entry point — no login required
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
