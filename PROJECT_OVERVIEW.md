# SeenTube — Complete Project Overview

> **Purpose:** This document provides a comprehensive overview of the entire SeenTube codebase. Use this as context when working with any AI model or new developer to quickly understand the project structure, architecture, and implementation details.

---

## 📋 Project Summary

**SeenTube** is a private, shared YouTube video collection tracker designed for **2 users (friends)**. It allows both users to save YouTube videos, categorize them, and independently track their watch status (pending / partially watched / watched). Each user can see their friend's watch status on every video.

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Astro (SSR mode) | ^5.0.0 |
| **Server Adapter** | @astrojs/node (standalone) | ^9.3.0 |
| **UI Framework** | React | ^19.1.0 |
| **Language** | TypeScript (strict) | ^5.8.3 |
| **Styling** | Tailwind CSS 4 (via Vite plugin) | ^4.1.11 |
| **Database** | Firebase Firestore (client-side) | ^11.10.0 |
| **Auth** | Firebase Authentication (Google OAuth) | ^11.10.0 |
| **Animations** | Framer Motion | ^12.19.0 |
| **Icons** | Lucide React | ^0.525.0 |
| **Toasts** | Sonner | ^2.0.5 |
| **Component Primitives** | Radix UI (shadcn pattern) | Various |
| **Node Version** | >=22.12.0 | — |

---

## 📁 Project Structure

```
SeenTube/
├── .astro/                     # Astro generated files
├── .env                        # Environment variables (secrets)
├── .env.example                # Env template
├── astro.config.mjs            # Astro configuration
├── drizzle.config.ts           # Drizzle ORM config (legacy/unused — app uses Firestore)
├── package.json                # Dependencies & scripts
├── tsconfig.json               # TypeScript configuration
├── seentube.db                 # SQLite file (legacy — unused)
├── design.md                   # Design system documentation
├── public/
│   ├── favicon.ico
│   └── favicon.svg
└── src/
    ├── env.d.ts                # Type declarations for Astro.Locals
    ├── components/
    │   ├── AddVideoForm.tsx    # Multi-step video addition form
    │   ├── DashboardClient.tsx # Dashboard page logic (auth + data + UI)
    │   ├── DashboardStats.tsx  # Animated stats cards + progress bar
    │   ├── Navbar.tsx          # Fixed top navigation (desktop + mobile)
    │   ├── StatusBadge.tsx     # Reusable status badge component
    │   ├── VideoCard.tsx       # Individual video card (status change, delete, friend status)
    │   ├── VideoGrid.tsx       # Filterable/sortable video grid
    │   ├── VideosClient.tsx    # Videos page logic (auth + data + UI)
    │   └── ui/                 # Shadcn-style UI primitives
    │       ├── avatar.tsx
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── dropdown-menu.tsx
    │       ├── input.tsx
    │       └── select.tsx
    ├── layouts/
    │   └── Layout.astro        # Base HTML layout (head, fonts, nav, toaster)
    ├── lib/
    │   ├── constants.ts        # Categories, TypeScript interfaces, types
    │   ├── firebase.ts         # Firebase initialization (auth, db, provider)
    │   ├── sse.ts              # Server-Sent Events infrastructure (real-time)
    │   └── utils.ts            # Utility functions (cn, YouTube helpers, formatters)
    ├── pages/
    │   ├── index.astro         # Dashboard route (/)
    │   ├── login.astro         # Login page (/login)
    │   ├── 403.astro           # Access denied page (/403)
    │   ├── api/
    │   │   └── youtube-meta.ts # API: fetch YouTube video metadata
    │   └── videos/
    │       ├── index.astro     # Video collection page (/videos)
    │       └── add.astro       # Add video page (/videos/add)
    └── styles/
        └── globals.css         # Global styles, CSS variables, custom classes
```

---

## 🗄️ Database — Firebase Firestore

The app uses **3 Firestore collections**:

### `videos` Collection
```typescript
{
  videoId: string;        // YouTube video ID (e.g. "dQw4w9WgXcQ")
  title: string;          // Video title (auto-fetched)
  thumbnail: string;      // Thumbnail URL (maxresdefault)
  category: string;       // One of: Music, Gaming, Education, Entertainment, Tech, News, Vlog, Other
  tags: string[];         // Up to 2 custom tags
  description: string;    // Optional user description
  addedBy: string;        // UID of the user who added it
  createdAt: number;      // Date.now() timestamp
}
```

### `videoStatuses` Collection
```typescript
{
  videoId: string;        // Reference to videos doc ID
  userId: string;         // UID of the user
  status: "pending" | "partially_watched" | "watched";
  progress: number;       // 0-100 (reserved for future use)
  updatedAt: number;      // Date.now() timestamp
}
```

### `users` Collection
```typescript
{
  id: string;             // Firebase UID
  name: string;           // Display name
  email: string;          // Email
  image: string;          // Profile photo URL
}
```

> **Note:** `drizzle.config.ts` and `seentube.db` exist from an earlier SQLite-based design but are **NOT used**. The app exclusively uses Firestore from the client side.

---

## 🔐 Authentication

| Aspect | Details |
|--------|---------|
| **Provider** | Firebase Authentication — Google OAuth (popup) |
| **Persistence** | `browserLocalPersistence` (stays logged in) |
| **Access Control** | Only 2 emails allowed (set in `.env` as `ALLOWED_EMAIL_1` and `ALLOWED_EMAIL_2`) |
| **Client Auth Check** | `onAuthStateChanged` listener in every client component |
| **Redirect** | Unauthenticated → `/login`, Unauthorized → `/403` |
| **Sign Out** | Calls `auth.signOut()` then redirects to `/login` |

### Auth Flow:
1. User visits any page → React component mounts → `onAuthStateChanged` fires
2. If no user → redirect to `/login`
3. User clicks "Continue with Google" → `signInWithPopup(auth, googleProvider)`
4. On success → `onAuthStateChanged` detects user → redirect to `/`
5. User profile is saved/updated in Firestore `users` collection on every login

---

## 🌐 API Routes

### `GET /api/youtube-meta`

**Purpose:** Fetches YouTube video metadata without requiring a YouTube Data API key.

**Query params:** `?url=<youtube-url>`

**How it works:**
1. Extracts video ID from URL via regex
2. Calls YouTube oEmbed endpoint: `https://www.youtube.com/oembed?url=...&format=json`
3. Returns `{ title, thumbnail, youtubeId }`

**No API key needed** — uses the public oEmbed API.

---

## 📄 Pages (Routes)

| Route | File | Description |
|-------|------|-------------|
| `/` | `index.astro` → `DashboardClient.tsx` | Dashboard with welcome message, stats cards, progress bar, recent videos list |
| `/login` | `login.astro` | Google OAuth login (no navbar shown) |
| `/403` | `403.astro` | Access denied for unauthorized emails |
| `/videos` | `videos/index.astro` → `VideosClient.tsx` | Full video grid with search, filters (category/status), sorting |
| `/videos/add` | `videos/add.astro` → `AddVideoForm.tsx` | Multi-step form: paste URL → auto-fetch → categorize → submit |

---

## 🧩 Components — Detailed Breakdown

### Page-Level Client Components (Handle Auth + Data)

#### `DashboardClient.tsx`
- Checks auth, redirects if not logged in
- Saves user to Firestore on login
- Fetches: all videos, all statuses, all users (to find the friend)
- Computes stats: total, watched, partially watched, pending
- Renders: welcome header, `DashboardStats`, recent videos list, empty state

#### `VideosClient.tsx`
- Same auth + user save pattern as Dashboard
- Fetches all videos + statuses + friend info
- Enriches each video with `myStatus`, `friendStatus`, `friendName`, `friendAvatar`
- Renders: page header with "Add Video" button + `VideoGrid`

### Feature Components

#### `AddVideoForm.tsx`
- **Step 1:** Paste YouTube URL → debounced auto-fetch (600ms) via `/api/youtube-meta`
- **Step 2:** (appears after fetch) Select category, add tags (up to 2), optional description
- **Submit:** Creates `videos` doc + `videoStatuses` doc (status: pending) in Firestore
- Uses `crypto.randomUUID()` for document IDs
- Shows success animation then redirects to `/videos`

#### `VideoGrid.tsx`
- Receives `initialVideos` and `currentUserId`
- **Search:** Filters by title, tags, category, description (case-insensitive)
- **Filters:** Category dropdown, Status dropdown
- **Sort:** Newest, Oldest, Title A-Z, By Status
- Toggleable filter panel with AnimatePresence
- Shows results count, clear filters button, empty state

#### `VideoCard.tsx`
- Displays: thumbnail (with fallback), category badge, title, description, tags, dates
- **Status dropdown:** Pending / Partially Watched / Watched (with optimistic update)
- **Delete:** Only shown to creator (`addedBy === currentUserId`), deletes video + all related statuses
- **Friend status section:** Shows friend's avatar + status message + badge
- YouTube link opens in new tab
- Framer Motion layout animations for smooth grid rearrangement

#### `DashboardStats.tsx`
- 4 animated stat cards: Total Videos (violet), Pending (amber), Partially Watched (blue), Watched (green)
- Collection progress bar (% watched) with animated fill
- Uses Framer Motion for stagger and spring animations

#### `StatusBadge.tsx`
- Reusable badge: renders icon (Clock/Eye/CheckCircle2) + label
- Three variants: `badge-pending` (amber), `badge-partially` (blue), `badge-watched` (green)
- Three sizes: sm, md, lg

#### `Navbar.tsx`
- Fixed top bar with backdrop blur
- Logo (SeenTube with gradient text)
- Desktop: Dashboard / Collection / Add Video links
- User avatar dropdown with sign-out option
- Mobile: hamburger menu with AnimatePresence slide-down

### UI Primitives (`src/components/ui/`)
Shadcn-style wrappers around Radix UI:
- `avatar.tsx` — User avatar with fallback
- `button.tsx` — Button with variants (default/destructive/outline/secondary/ghost/link) and sizes
- `card.tsx` — Card container (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- `dropdown-menu.tsx` — Context menu / dropdown (Trigger, Content, Item, Label, Separator, etc.)
- `input.tsx` — Styled text input
- `select.tsx` — Custom select dropdown (Trigger, Content, Item, etc.)

---

## 📚 Library Files

### `src/lib/firebase.ts`
```typescript
// Singleton Firebase initialization
// Exports: auth, db (Firestore), googleProvider
// Sets browserLocalPersistence
```

### `src/lib/constants.ts`
```typescript
export const CATEGORIES = ["Music", "Gaming", "Education", "Entertainment", "Tech", "News", "Vlog", "Other"];
export type VideoStatusEnum = "pending" | "partially_watched" | "watched";
export interface Video { id, videoId, title, thumbnail, channelTitle, duration, category, tags, addedBy, createdAt }
export interface VideoStatus { id, videoId, userId, status, progress, updatedAt }
export interface User { id, name, email, image }
```

### `src/lib/utils.ts`
| Function | Purpose |
|----------|---------|
| `cn(...inputs)` | Tailwind class merger (clsx + tailwind-merge) |
| `extractYouTubeId(url)` | Parses YouTube URLs (watch, youtu.be, shorts, embed) → returns video ID |
| `getYouTubeThumbnail(id, quality)` | Builds thumbnail URL at max/high/medium/default quality |
| `formatStatus(status)` | "partially_watched" → "Partially Watched" |
| `getFriendStatusMessage(name, status)` | "Ahmed watched this entire video." |
| `getStatusColor(status)` | Returns color name (amber/blue/green/gray) |
| `formatDate(date)` | "15 Jul 2026" (en-IN locale) |
| `formatRelativeDate(date)` | "just now", "5m ago", "2d ago", etc. |

### `src/lib/sse.ts`
Server-Sent Events infrastructure (for potential real-time updates):
- In-memory client registry (`Map<id, SSEClient>`)
- `addSSEClient()`, `removeSSEClient()`, `broadcastSSE()`, `getClientCount()`
- Event types: `status_update`, `video_added`, `video_deleted`
- **Status:** Infrastructure exists but not fully wired up to the UI yet

---

## 🎨 Design System

### Theme
- **Aesthetic:** Light & airy minimalist with soft lavender/purple gradients
- **Color scheme:** Light mode only (no dark mode implemented despite `class="dark"` on html)

### Fonts
- **Display (headings):** Outfit (Google Fonts) — modern, geometric, friendly
- **Body (UI text):** Inter (Google Fonts) — highly readable

### Key Colors
| Role | Color | Hex |
|------|-------|-----|
| Primary | Violet | `#7C6CF8` |
| Background | Soft Lavender | `#F6F5FF` |
| Foreground | Dark Navy | `#0F172A` |
| Muted Text | Gray | `#6B7280` |
| Status: Pending | Amber | — |
| Status: Partial | Blue | — |
| Status: Watched | Green | — |

### Custom CSS Classes
- `.card` — White card with hover lift + shadow
- `.glass-card` — Semi-transparent card with backdrop blur
- `.gradient-text` — Violet-to-purple gradient on text
- `.badge-pending`, `.badge-partially`, `.badge-watched` — Status pill styles
- `.bg-decoration` — Fixed background decorative blurred circles
- `.animate-fade-in`, `.animate-slide-in`, `.animate-scale-in` — CSS keyframe animations

---

## ⚙️ Configuration

### `astro.config.mjs`
```javascript
output: "server"              // SSR mode
adapter: node({ mode: "standalone" })
integrations: [react()]
vite.plugins: [tailwindcss()]
devToolbar: { enabled: false }
```

### `tsconfig.json`
```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "strictNullChecks": true,
    "paths": {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
      "@lib/*": ["./src/lib/*"],
      "@styles/*": ["./src/styles/*"]
    },
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  }
}
```

### Environment Variables (`.env`)
```env
PUBLIC_FIREBASE_API_KEY=...
PUBLIC_FIREBASE_AUTH_DOMAIN=...
PUBLIC_FIREBASE_PROJECT_ID=...
PUBLIC_FIREBASE_STORAGE_BUCKET=...
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
PUBLIC_FIREBASE_APP_ID=...
```

Only Firebase Web App configuration is currently consumed. Local values belong in the ignored `.env` file; Vercel values are entered manually in Project Settings. Never add service-account JSON, OAuth client secrets, or Firebase Admin private keys to a `PUBLIC_` variable.

---

## 🔄 Architecture & Data Flow

### Pattern: Client-Heavy SPA within Astro SSR Shell

```
[Browser] → [Astro Page (SSR)] → [React Component (client:load)]
                                          ↓
                                   [Firebase Auth Check]
                                          ↓
                                   [Firestore Read/Write]
                                          ↓
                                   [Render UI with State]
```

### Key Architectural Decisions:
1. **Astro pages are thin shells** — they only render layout and hydrate the React component
2. **All data operations happen client-side** — Firestore is accessed directly from the browser
3. **No server-side middleware or auth checks** — auth is entirely client-side via Firebase
4. **2-user design** — the app identifies the "friend" by finding a user in Firestore with a different UID and different email
5. **Optimistic updates** — status changes update UI immediately, then write to Firestore
6. **YouTube metadata via oEmbed** — no YouTube Data API key required

### User Flow:
1. Open app → Astro serves page → React mounts
2. `onAuthStateChanged` checks if logged in
3. Not logged in → redirect to `/login` → Google popup sign-in
4. Logged in → user saved to Firestore → fetch videos + statuses + users
5. Friend identified → videos enriched with both users' statuses
6. User interacts (change status, add video, delete) → Firestore write → UI update

---

## 📦 Scripts

```bash
npm run dev      # Start Astro dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run astro    # Astro CLI
```

---

## ⚠️ Notes & Gotchas

1. **Drizzle/SQLite is legacy** — `drizzle.config.ts` and `seentube.db` exist but the app uses Firestore. These can be cleaned up.
2. **SSE module exists but isn't connected** — `src/lib/sse.ts` has broadcast infrastructure but no endpoint or client subscription is wired up yet.
3. **`firebase-admin` is installed but minimally used** — server-side admin operations aren't implemented in the current flow.
4. **No server-side auth middleware** — all auth is client-side; Firestore Security Rules would be the enforcement layer.
5. **2-user hardcoded design** — the friend detection logic finds "the other user" in Firestore; this doesn't scale beyond 2 users without redesign.
6. **`src/env.d.ts` declares Astro.Locals** — with user/session types, suggesting a planned server-side auth middleware that isn't implemented yet.
7. **Light theme only** — despite `class="dark"` on `<html>`, the CSS variables are all light-mode values.

---

## 🚀 Getting Started

```bash
# 1. Clone the repo
git clone <repo-url>
cd SeenTube

# 2. Install dependencies (Node >= 22.12.0)
npm install

# 3. Copy env file and fill in Firebase credentials
cp .env.example .env

# 4. Start dev server
npm run dev

# 5. Open http://localhost:4321
```

---

*Last updated: July 2026*
