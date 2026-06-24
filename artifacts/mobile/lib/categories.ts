export const POST_CATEGORIES = [
  { id: "music",       emoji: "🎵", label: "Music" },
  { id: "dance",       emoji: "💃", label: "Dance" },
  { id: "comedy",      emoji: "😂", label: "Comedy" },
  { id: "travel",      emoji: "✈️", label: "Travel" },
  { id: "food",        emoji: "🍕", label: "Food" },
  { id: "fitness",     emoji: "💪", label: "Fitness" },
  { id: "gaming",      emoji: "🎮", label: "Gaming" },
  { id: "photography", emoji: "📸", label: "Photo" },
  { id: "art",         emoji: "🎨", label: "Art" },
  { id: "fashion",     emoji: "💄", label: "Fashion" },
  { id: "pets",        emoji: "🐾", label: "Pets" },
  { id: "sports",      emoji: "⚽", label: "Sports" },
  { id: "tech",        emoji: "💻", label: "Tech" },
  { id: "education",   emoji: "📚", label: "Education" },
  { id: "nature",      emoji: "🌿", label: "Nature" },
  { id: "love",        emoji: "💕", label: "Love" },
  { id: "spiritual",   emoji: "🙏", label: "Spiritual" },
  { id: "memes",       emoji: "😂", label: "Memes" },
  { id: "culture",     emoji: "💃", label: "Culture" },
  { id: "other",       emoji: "✨", label: "Other" },
] as const;

export type CategoryId = typeof POST_CATEGORIES[number]["id"];
