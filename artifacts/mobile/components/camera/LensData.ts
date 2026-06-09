export type LensCategory = 'cute' | 'beauty' | 'fun' | 'world' | 'spiritual';

export interface Lens {
  id: string;
  name: string;
  icon: string;
  category: LensCategory;
}

export const LENSES: Lens[] = [
  // ── Cute Animals ───────────────────────────────────────────────────────────
  { id: 'dog',           name: 'Dog',          icon: '🐶', category: 'cute' },
  { id: 'cat',           name: 'Cat',          icon: '🐱', category: 'cute' },
  { id: 'bunny',         name: 'Bunny',        icon: '🐰', category: 'cute' },
  { id: 'bear',          name: 'Bear',         icon: '🐻', category: 'cute' },
  { id: 'deer',          name: 'Deer',         icon: '🦌', category: 'cute' },
  // ── Beauty & Makeup ────────────────────────────────────────────────────────
  { id: 'natural_glow',  name: 'Natural Glow', icon: '✨', category: 'beauty' },
  { id: 'full_glam',     name: 'Full Glam',    icon: '💄', category: 'beauty' },
  { id: 'korean',        name: 'K-Beauty',     icon: '🌸', category: 'beauty' },
  { id: 'bold_lip',      name: 'Bold Lip',     icon: '💋', category: 'beauty' },
  { id: 'eye_color',     name: 'Eye Color',    icon: '👁️', category: 'beauty' },
  // ── Fun & Viral ────────────────────────────────────────────────────────────
  { id: 'flower_crown',  name: 'Flower Crown', icon: '🌺', category: 'fun' },
  { id: 'crying_stars',  name: 'Sparkle Tears',icon: '🌟', category: 'fun' },
  { id: 'rainbow',       name: 'Rainbow',      icon: '🌈', category: 'fun' },
  { id: 'giant_eyes',    name: 'Giant Eyes',   icon: '👀', category: 'fun' },
  { id: 'neon_glow',     name: 'Neon Glow',    icon: '⚡', category: 'fun' },
  { id: 'vintage',       name: 'Vintage',      icon: '📷', category: 'fun' },
  { id: 'anime',         name: 'Anime',        icon: '🌟', category: 'fun' },
  { id: 'crown',         name: 'Crown',        icon: '👑', category: 'fun' },
  { id: 'mask',          name: 'G-Mask',       icon: '🎭', category: 'fun' },
  { id: 'distortion',    name: 'Distortion',   icon: '🫠', category: 'fun' },
  // ── World & Background ─────────────────────────────────────────────────────
  { id: 'snow',          name: 'Snow',         icon: '❄️', category: 'world' },
  { id: 'butterflies',   name: 'Butterflies',  icon: '🦋', category: 'world' },
  { id: 'confetti',      name: 'Confetti',     icon: '🎊', category: 'world' },
  { id: 'halo_wings',    name: 'Halo & Wings', icon: '😇', category: 'world' },
  { id: 'space',         name: 'Space',        icon: '🌌', category: 'world' },
  { id: 'matrix',        name: 'Matrix',       icon: '🖥️', category: 'world' },
  { id: 'underwater',    name: 'Underwater',   icon: '🌊', category: 'world' },
  { id: 'fire',          name: 'Fire',         icon: '🔥', category: 'world' },
  // ── Jyotisha / Spiritual ───────────────────────────────────────────────────
  { id: 'zodiac_aura',   name: 'Zodiac Aura',  icon: '🔮', category: 'spiritual' },
  { id: 'chakra',        name: 'Chakra',       icon: '☯️', category: 'spiritual' },
  { id: 'goddess',       name: 'Goddess',      icon: '🌺', category: 'spiritual' },
  { id: 'om_aura',       name: 'Om Aura',      icon: '🕉️', category: 'spiritual' },
  { id: 'navagraha',     name: 'Navagraha',    icon: '🪐', category: 'spiritual' },
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
