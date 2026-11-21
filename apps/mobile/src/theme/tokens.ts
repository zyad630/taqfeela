/**
 * Taqfeela Mobile Design System Tokens
 * Source of Truth: 03-UI-SPEC.md & reference/screens/*.dc.html
 */

export const colors = {
  // Backgrounds & Surfaces
  bg: '#FDF3E7',
  surface: '#FFFFFF',
  border: '#E3CDAE',
  divider: '#F0E0C9',

  // Typography
  text: '#2B1A14',       // Primary espresso (used for text on orange as well)
  text2: '#5A463A',      // Secondary text
  muted: '#7A6657',      // Captions & hints

  // Taqfeela Signature Brand Orange
  orange: '#EE7F14',
  orangeText: '#B85C00', // Contrast text/icons on light backgrounds
  orangeTint: '#FCE3C4', // Highlighted cards, outbox banner, mine tables

  // Palette Secondary
  brown: '#6B4226',
  darkBrown: '#5A3A28',
  tan: '#D9B38A',

  // Status Colors (Icons + Text, never color-only)
  green: '#2E9E62',
  greenTint: '#DDF0E3',
  greenText: '#1F6B42',

  red: '#C2432A',
  redTint: '#FDE8E5',
  redText: '#991B1B',

  // Transparent / Shimmer
  transparent: 'transparent',
  shimmerBg: 'rgba(238, 127, 20, 0.08)',
  overlay: 'rgba(43, 26, 20, 0.5)'
} as const;

export const fonts = {
  // Arabic Baloo for Numbers & Titles
  balooSemiBold: 'BalooBhaijaan2_600SemiBold',
  balooBold: 'BalooBhaijaan2_700Bold',
  balooExtraBold: 'BalooBhaijaan2_800ExtraBold',

  // Cairo for Body & Controls
  cairoRegular: 'Cairo_400Regular',
  cairoSemiBold: 'Cairo_600SemiBold',
  cairoBold: 'Cairo_700Bold'
} as const;

export const radii = {
  chip: 12,
  pill: 999,
  input: 14,
  card: 18,
  hero: 20,
  button: 16,
  dot: 50
} as const;

export const layout = {
  sidePadding: 20,
  headerTopPadding: 28,
  bottomNavHeight: 76,
  minTapTarget: 44
} as const;

export const shadows = {
  cardRing: {
    shadowColor: '#EE7F14',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3
  },
  heroGlow: {
    shadowColor: '#B85C00',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5
  }
} as const;
