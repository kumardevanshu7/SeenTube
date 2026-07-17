# SeenTube Design System & UI Guidelines

This document outlines the design language, typography, color palette, and UI components used in the SeenTube application. It serves as a reference for maintaining a consistent, premium user experience.

---

## 🎨 Theme & Aesthetic

**Theme:** Light & Airy Minimalist
**Vibe:** Soft, premium, friendly, and clean.
**Inspiration:** Modern SaaS dashboards with soft pastel gradients, glassmorphism, and distinct but gentle contrast.

The UI relies heavily on:
- A soft lavender/purple gradient background
- Crisp white cards with very subtle shadows
- Smooth hover animations and transitions
- Pastel-colored status badges and icons

---

## 🅰️ Typography

We use two distinct Google Fonts to create a modern hierarchy:

### 1. Display Font (Headings)
**Font:** `Outfit`
**Weights Used:** 400 (Regular), 600 (SemiBold), 700 (Bold)
**Usage:** Page titles, card headers, numbers, and primary branding.
- Outfit gives the app a modern, geometric, and friendly feel.

### 2. Base Font (Body Text & UI)
**Font:** `Inter`
**Weights Used:** 400 (Regular), 500 (Medium), 600 (SemiBold)
**Usage:** Paragraphs, descriptions, buttons, forms, and general UI text.
- Inter is highly readable and ensures perfect legibility for smaller UI elements.

---

## 🌈 Color Palette

Our colors are defined using HSL values in `src/styles/globals.css` and map directly to Tailwind CSS utility classes.

### Core Backgrounds & Text
| Element | Hex (Approx) | HSL | Tailwind Class | Usage |
|---------|-------------|-----|----------------|-------|
| **Background** | `#F6F5FF` | `248 67% 98%` | `bg-background` | Main page background (soft lavender tint) |
| **Foreground** | `#0F172A` | `222 47% 11%` | `text-foreground` | Primary text (dark navy) |
| **Card** | `#FFFFFF` | `0 0% 100%` | `bg-card` | White backgrounds for all cards and popovers |
| **Muted Text** | `#6B7280` | `215 16% 47%` | `text-muted-foreground` | Secondary text, placeholders, subtitles |

### Brand Colors (Primary / Secondary)
| Color | Hex (Approx) | HSL | Tailwind Class | Usage |
|-------|-------------|-----|----------------|-------|
| **Primary** | `#7C6CF8` | `250 84% 67%` | `bg-primary`, `text-primary` | Main buttons, active states, focus rings, links |
| **Secondary** | `#EDEBFF` | `248 100% 96%` | `bg-secondary` | Subtle highlights, category pills, light backgrounds |

### Status Colors (Semantic)
Pastel tones used for video statuses and metrics cards:

- **Pending (Amber/Yellow)**
  - Background: `hsl(43 96% 93%)`
  - Text: `hsl(32 95% 44%)`
  - *Used for videos that haven't been started.*

- **Partially Watched (Soft Blue)**
  - Background: `hsl(214 100% 93%)`
  - Text: `hsl(221 83% 45%)`
  - *Used for videos that are currently in progress.*

- **Watched (Mint Green)**
  - Background: `hsl(141 79% 91%)`
  - Text: `hsl(142 71% 35%)`
  - *Used for completed videos and success states.*

---

## 🧱 UI Components & Elements

### 1. Cards
- **Base Style (`.card`):** Pure white background, subtle 1px border (`#E5E7EB`), rounded corners (`14px`), and a very light shadow.
- **Hover State:** When hovered, cards lift up slightly (`translateY(-1px)`), the shadow deepens, and the border turns to a faint primary purple color. This creates a highly tactile feel.

### 2. Buttons
- **Primary Buttons:** Solid `#7C6CF8` background, white text, semi-bold. On click, they slightly scale down (`active:scale-95`).
- **Google Login Button:** White background with a light gray border and the Google logo. Text is dark gray. It stands out clearly against the white card on the login screen.

### 3. Sidebar / Navigation
- **Links:** Rounded items (`12px`) with Medium font weight.
- **Hover:** Very light violet background with primary purple text.
- **Active State:** Dark navy background (`#1A1B2E`) with pure white text and a soft drop shadow. This creates a striking, premium contrast against the light theme.

### 4. Background Gradients & Decorations
- The main body features a subtle linear gradient spanning from a soft blue-ish tint to a lavender tint.
- The `bg-decoration` class adds two large, blurred radial gradients (one top-right, one bottom-left) that stay fixed in the background, giving the app a fluid, "Aether"-like aesthetic without being distracting.

### 5. Gradient Text
- The `.gradient-text` class applies a smooth diagonal gradient (from `#7C6CF8` to `#C084FC`) directly to text. This is used sparingly on the Logo text and page headers to add a premium touch.

---

## ✨ Animations

We use Framer Motion and pure CSS for micro-interactions:
- **Fade In:** `animate-fade-in` (Slight slide up and fade, used on page load).
- **Staggered Lists:** Video cards appear one after another sequentially.
- **Hover Lifts:** Cards and buttons physically react to the mouse cursor.
- **Layout Animations:** Using Framer Motion's `layout` prop, the grid smoothly re-arranges itself when you filter, search, or delete a video.

---

## 🛠️ Tailwind Config Overrides
- `radius`: Standardized to `14px` (`0.875rem`) for a soft but structured look.
- `font-sans`: Bound to `Inter`.
- `font-display`: Bound to `Outfit`.
