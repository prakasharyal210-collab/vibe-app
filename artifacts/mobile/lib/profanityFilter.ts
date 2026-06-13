/**
 * Simple profanity filter for user-submitted text (captions, comments, bios).
 * Approach: exact-word and substring matching against a curated wordlist.
 * Returns { ok: true } when clean, or { ok: false, reason } when flagged.
 *
 * For v1 this is intentionally simple — no ML, no external API.
 * The list below covers the most common English profanity. Extend as needed.
 */

const BLOCKED_WORDS: string[] = [
  "fuck", "shit", "cunt", "nigger", "nigga", "faggot", "kike", "spic",
  "chink", "wetback", "retard", "whore", "slut", "bitch", "asshole",
  "bastard", "cock", "pussy", "dick", "penis", "vagina", "dildo", "cum",
  "jizz", "motherfucker", "fucker", "bullshit", "jackass", "dipshit",
];

// Normalise: lowercase, strip common leet-speak substitutions
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/8/g, "b")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/!/g, "i");
}

export interface FilterResult {
  ok: boolean;
  reason?: string;
}

export function checkProfanity(text: string): FilterResult {
  if (!text || text.trim().length === 0) return { ok: true };
  const normalised = normalise(text);
  for (const word of BLOCKED_WORDS) {
    if (normalised.includes(word)) {
      return {
        ok: false,
        reason: "Your message contains content that violates our community guidelines. Please revise before posting.",
      };
    }
  }
  return { ok: true };
}
