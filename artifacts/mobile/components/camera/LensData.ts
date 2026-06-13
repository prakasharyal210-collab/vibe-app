export type LensCategory = 'cute' | 'beauty' | 'fun' | 'world' | 'spiritual';

export interface Lens {
  id: string;
  name: string;
  icon: string;
  category: LensCategory;
  /** Banuba effect folder name (passed to BanubaCameraView.loadEffect), or null if not yet built. */
  effectPath: string | null;
}

export const LENSES: Lens[] = [
  // ── Cute Animals ───────────────────────────────────────────────────────────
  { id: 'dog',           name: 'Dog',          icon: '🐶', category: 'cute',      effectPath: null },
  { id: 'cat',           name: 'Cat',          icon: '🐱', category: 'cute',      effectPath: null },
  { id: 'bunny',         name: 'Bunny',        icon: '🐰', category: 'cute',      effectPath: null },
  { id: 'bear',          name: 'Bear',         icon: '🐻', category: 'cute',      effectPath: null },
  { id: 'deer',          name: 'Deer',         icon: '🦌', category: 'cute',      effectPath: null },
  // ── Beauty & Makeup ────────────────────────────────────────────────────────
  { id: 'natural_glow',  name: 'Natural Glow', icon: '✨', category: 'beauty',    effectPath: null },
  { id: 'full_glam',     name: 'Full Glam',    icon: '💄', category: 'beauty',    effectPath: null },
  { id: 'korean',        name: 'K-Beauty',     icon: '🌸', category: 'beauty',    effectPath: null },
  { id: 'bold_lip',      name: 'Bold Lip',     icon: '💋', category: 'beauty',    effectPath: null },
  { id: 'eye_color',     name: 'Eye Color',    icon: '👁️', category: 'beauty',    effectPath: null },
  // ── Fun & Viral ────────────────────────────────────────────────────────────
  { id: 'flower_crown',  name: 'Flower Crown', icon: '🌺', category: 'fun',       effectPath: null },
  { id: 'crying_stars',  name: 'Sparkle Tears',icon: '🌟', category: 'fun',       effectPath: null },
  { id: 'rainbow',       name: 'Rainbow',      icon: '🌈', category: 'fun',       effectPath: null },
  { id: 'giant_eyes',    name: 'Giant Eyes',   icon: '👀', category: 'fun',       effectPath: null },
  { id: 'neon_glow',     name: 'Troll Grandma',icon: '⚡', category: 'fun',       effectPath: 'TrollGrandma' },
  { id: 'vintage',       name: 'Vintage',      icon: '📷', category: 'fun',       effectPath: null },
  { id: 'anime',         name: 'Anime',        icon: '🌟', category: 'fun',       effectPath: null },
  { id: 'crown',         name: 'Crown',        icon: '👑', category: 'fun',       effectPath: null },
  { id: 'mask',          name: 'Pineapple 🍍', icon: '🎭', category: 'fun',       effectPath: 'PineappleGlasses' },
  { id: 'distortion',    name: 'Distortion',   icon: '🫠', category: 'fun',       effectPath: null },
  // ── World & Background ─────────────────────────────────────────────────────
  { id: 'snow',          name: 'Snow',         icon: '❄️', category: 'world',     effectPath: null },
  { id: 'butterflies',   name: 'Butterflies',  icon: '🦋', category: 'world',     effectPath: null },
  { id: 'confetti',      name: 'Confetti',     icon: '🎊', category: 'world',     effectPath: null },
  { id: 'halo_wings',    name: 'Halo & Wings', icon: '😇', category: 'world',     effectPath: null },
  { id: 'space',         name: 'Space',        icon: '🌌', category: 'world',     effectPath: null },
  { id: 'matrix',        name: 'Matrix',       icon: '🖥️', category: 'world',     effectPath: null },
  { id: 'underwater',    name: 'Underwater',   icon: '🌊', category: 'world',     effectPath: null },
  { id: 'fire',          name: 'Fire',         icon: '🔥', category: 'world',     effectPath: null },
  // ── Astrology / Spiritual ──────────────────────────────────────────────────
  { id: 'zodiac_aura',   name: 'Zodiac Aura',  icon: '🔮', category: 'spiritual', effectPath: null },
  { id: 'chakra',        name: 'Chakra',       icon: '☯️', category: 'spiritual', effectPath: null },
  { id: 'goddess',       name: 'Goddess',      icon: '🌺', category: 'spiritual', effectPath: null },
  { id: 'om_aura',       name: 'Om Aura',      icon: '🕉️', category: 'spiritual', effectPath: null },
  { id: 'navagraha',     name: 'Navagraha',    icon: '🪐', category: 'spiritual', effectPath: null },
];

export const CATEGORY_LABELS: Record<LensCategory | 'all', string> = {
  all:       'All',
  cute:      '🐾 Cute',
  beauty:    '💄 Beauty',
  fun:       '🎉 Fun',
  world:     '🌍 World',
  spiritual: '🕉️ Spiritual',
};

export type AllCategory = LensCategory | 'all';
