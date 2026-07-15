export const VIBE_PROMPT_QUESTIONS = [
  "Sundays are for...",
  "Right now I'm a huge fan of...",
  "My ideal weekend...",
  "A random fact I love...",
  "You'll know I like you if...",
  "Two truths and a lie...",
  "I'm looking for...",
  "Ask me about...",
] as const;

export type VibePromptQuestion = (typeof VIBE_PROMPT_QUESTIONS)[number];

export interface VibePrompt {
  question: string;
  answer: string;
}

export const MAX_VIBE_PROMPTS = 3;
