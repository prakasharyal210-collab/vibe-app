---
name: expo-clipboard version conflict
description: expo-clipboard installs wrong major version without pinning; causes "could not be found" bundler error
---

# Rule
When installing expo-clipboard, pin it to `~8.0.8` (or whatever the Expo doctor reports as expected). Do NOT `pnpm add expo-clipboard` without checking the expected version first.

**Why:** `pnpm add expo-clipboard` resolves to a much newer major (e.g., 56.x) that is incompatible with the installed Expo SDK, causing a Metro "Unable to resolve" bundler error even though the package appears in node_modules.

**How to apply:** Run `expo install expo-clipboard` (which auto-pins) or check `expo doctor` output for the expected version string first.
