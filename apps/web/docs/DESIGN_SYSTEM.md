# Steluma Design System

## Design Philosophy

**Premium. Invisible blockchain. Consumer-first.**

The design language sits at the intersection of:
- **Luma** — clean, editorial event presentation
- **Linear** — crisp typography, high information density
- **Stripe** — trustworthy, financial-grade polish
- **Partiful** — social energy, delight in interactions

Blockchain is infrastructure, not personality. Users should feel they're using a superior event platform, not a crypto product.

## Color System

### Light Theme (Primary)
```css
/* Base */
--background: 0 0% 100%         /* #FFFFFF — page background */
--foreground: 224 71% 4%        /* #06070D — primary text */

/* Surface layers */
--surface-1: 220 14% 96%        /* #F3F4F7 — subtle page tint */
--surface-2: 220 13% 91%        /* #E4E6ED — card backgrounds */

/* Brand */
--violet-50: #F5F3FF
--violet-100: #EDE9FE
--violet-500: #8B5CF6
--violet-600: #7C3AED  ← primary brand
--violet-700: #6D28D9
--indigo-500: #6366F1
--indigo-600: #4F46E5

/* Semantic */
--primary: 263 70% 50%          /* violet-600 */
--primary-foreground: 0 0% 100%
--muted: 220 14% 96%
--muted-foreground: 220 9% 46%
--border: 220 13% 91%
--ring: 263 70% 50%

/* Status */
--success: #10B981    (emerald-500)
--warning: #F59E0B    (amber-500)
--danger: #EF4444     (red-500)
--info: #3B82F6       (blue-500)
```

### Dark Theme (Automatic)
```css
--background: 224 71% 4%        /* #06070D — near-black */
--foreground: 213 31% 91%       /* #E2E8F0 — soft white */
--surface-1: 222 47% 8%         /* #0D1117 */
--surface-2: 222 47% 11%        /* #111827 */
--border: 215 28% 17%           /* #1E293B */
--muted: 215 28% 17%
--muted-foreground: 217 10% 64% /* #94A3B8 */
```

## Typography

### Scale
```
display-2xl: 72px / line-height 1.1 / tracking -0.04em  — Hero headlines
display-xl:  60px / line-height 1.1 / tracking -0.03em  — Section headlines
display-lg:  48px / line-height 1.1 / tracking -0.02em  — Page titles
display-md:  36px / line-height 1.2 / tracking -0.02em  — Card titles
display-sm:  30px / line-height 1.3 / tracking -0.01em
text-xl:     20px / line-height 1.5 / tracking 0
text-lg:     18px / line-height 1.6 / tracking 0
text-base:   16px / line-height 1.6 / tracking 0         — Body default
text-sm:     14px / line-height 1.5 / tracking 0.01em
text-xs:     12px / line-height 1.4 / tracking 0.02em
```

### Font Stack
- **Primary**: Inter Variable — body, UI, data
- **Display**: Inter Variable (tight tracking) — headlines
- **Mono**: JetBrains Mono — wallet addresses, contract IDs, code

### Weight Usage
- 900/800: Never (too heavy)
- 700: Hero display text only
- 600: Section headings, card titles
- 500: Navigation, labels, button text
- 400: Body text default
- 300: Rarely — muted metadata

## Spacing Scale
```
0.5rem (8px)   — micro gaps, icon padding
1rem   (16px)  — component internal padding
1.5rem (24px)  — card padding
2rem   (32px)  — section padding (mobile)
3rem   (48px)  — section padding (desktop)
4rem   (64px)  — major section gaps
6rem   (96px)  — hero vertical padding
```

## Border Radius
```
--radius-sm: 6px    — badges, pills
--radius-md: 10px   — inputs, small buttons
--radius-lg: 14px   — cards, modals (default)
--radius-xl: 20px   — large cards, hero elements
--radius-2xl: 28px  — sheet overlays
--radius-full: 9999px — avatars, pills, tags
```

## Shadow System
```
shadow-xs:  0 1px 2px rgba(0,0,0,0.04)
shadow-sm:  0 2px 4px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)
shadow-md:  0 4px 8px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)
shadow-lg:  0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.06)
shadow-xl:  0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.08)

/* Brand glow (violet) */
shadow-violet: 0 0 0 1px rgba(124,58,237,0.1), 0 8px 24px rgba(124,58,237,0.15)

/* Elevation for dark mode */
shadow-elevated: 0 0 0 1px rgba(255,255,255,0.08), 0 8px 24px rgba(0,0,0,0.4)
```

## Animation Principles

### Timing
```
fast:     150ms  — micro-interactions (hover states)
default:  250ms  — element transitions
moderate: 350ms  — panel slides, modal open
slow:     500ms  — page transitions, hero reveals
```

### Easing
```
ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1)   — elements entering
ease-in-expo:  cubic-bezier(0.7, 0, 0.84, 0)    — elements leaving  
ease-spring:   spring(damping: 20, stiffness: 300) — playful interactions
```

### Motion Principles
1. **Purposeful** — every animation communicates meaning
2. **Responsive** — animations respect `prefers-reduced-motion`
3. **Subtle** — translate 8–16px max, opacity 0→1
4. **Staggered** — list items stagger at 40–60ms intervals

## Component Variants

### Button
```
primary:   violet-600 bg, white text, violet shadow on hover
secondary: white bg, gray border, subtle shadow
ghost:     transparent bg, hover shows bg
danger:    red-500 bg for destructive actions
gradient:  violet→indigo gradient bg
```

### Card
```
default:   white bg, gray border, sm shadow
elevated:  white bg, stronger shadow, lifts on hover
glass:     white/10 bg, blur backdrop, border white/20
feature:   gradient border, icon accent
event:     image header, gradient overlay, content below
ticket:    decorative notch design, QR section
badge:     circular/hexagonal, glow effect
```

## Live Data Visual Language

- **Pulsing dot** — green for live/active, amber for pending
- **Animated counter** — numbers count up on mount
- **Progress bars** — animate width from 0 on mount
- **Flash update** — brief highlight when a value updates
- **Activity feed** — items slide in from top

## Loading States

Every data-dependent surface has a skeleton matching its exact layout:
- Text lines: rounded rectangles at correct widths
- Images: gradient shimmer
- Cards: full card skeleton including image + content
- Numbers: short width rectangles

Never show empty containers. Never show raw spinners without context.
