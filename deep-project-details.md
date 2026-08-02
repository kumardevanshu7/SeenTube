# SeenTube — Deep Project Details

> Personal reference doc for interviews, portfolio, and debugging.
> Stack: **Astro 5 (SSR) · React 19 · TypeScript · Tailwind 4 · Firebase Auth + Firestore · Firebase Admin · Vercel · jsPDF**

---

## 1. What is SeenTube?

SeenTube is a **social YouTube collection + learning-roadmap app**.

A user can:
1. Sign in with Google and claim a unique `@username`
2. Save YouTube videos into a personal collection (with category, tags, description, watch status)
3. Connect with other users by username (like a friend request)
4. See **accepted connections'** public videos ("Guild") and import them into their own collection
5. Build ordered **learning roadmaps** (step-by-step YouTube paths), share them with connections, copy them, and download as HTML/PDF
6. Protect deletes and sensitive edits with a personal **"One Password"** (security question + hashed answer)

**Product owner:** Arigato Labs (founder: Kumar Devanshu). The `/explore` page is the company/about surface.

**Rough size:** ~17 pages, ~24 React components, 3 API routes, ~8.5K lines under `src/`.

---

## 2. Why was this built? (the need)

**Real problem:**
- People save YouTube links in WhatsApp/Notes/bookmarks — no structure, no progress, no sharing model.
- Playlists on YouTube are public/private but not "friend-gated", and they don't track *your* learning status separately from someone else's.
- Learners want an ordered path ("watch A → B → C") with completion tracking, and sometimes want to share that path only with trusted people — not the whole internet.

**What SeenTube uniquely does:**
- Personal collection + watch status (pending / partially watched / watched)
- **Connection-gated** sharing (not open social feed)
- Ordered **roadmaps** with per-step status and copy/download
- Destructive actions gated by a **server-verified** security answer (not just a client confirm dialog)

**Interview one-liner:**
> "I built SeenTube because I kept losing educational YouTube videos across chats and notes. I wanted a private-first collection with friend sharing and ordered learning paths — not another public social feed."

---

## 3. How it works (high-level architecture)

```
Browser (Astro pages + React islands)
    │
    ├─ Firebase Client SDK ──► Auth (Google) + Firestore (user data)
    │
    └─ Bearer ID token ──────► Astro API routes on Vercel
                                    │
                                    └─ Firebase Admin SDK
                                         ├─ verifyIdToken
                                         ├─ deletionCredentials (hashes)
                                         └─ privileged deletes of videos/roadmaps
```

- **Most CRUD** happens directly from the browser to Firestore, authorized by **Security Rules**.
- **Deletes + One Password setup/verify + YouTube metadata fetch** go through **server API routes** (Admin SDK / server fetch).
- Astro runs in **SSR mode** (`output: "server"`) with the **Vercel adapter** because there are API routes and auth-aware pages.

### Why Astro + React islands?
- Astro ships mostly static HTML per page; React islands hydrate only interactive parts (`VideosClient`, `RoadmapsClient`, etc.).
- Faster first paint than a full SPA; still get React for forms, dialogs, grids.

### Why Firebase?
- Auth + realtime DB without maintaining a custom backend for every CRUD path.
- Security Rules become the authorization layer for client writes.
- Admin SDK for secrets (credential hashes) that **must never** be client-readable.

---

## 4. Tools & tech (what / why)

| Tool | Role |
|------|------|
| **Astro 5** | App framework, SSR, file-based routing, islands |
| **React 19** | Interactive UI islands |
| **TypeScript** | Types for models, API payloads, props |
| **Tailwind CSS 4** | Styling + design tokens in `globals.css` |
| **Firebase Auth** | Google sign-in, ID tokens, local persistence |
| **Cloud Firestore** | Primary database |
| **Firebase Admin** | Server auth verify, credential store, privileged deletes |
| **Vercel** | Hosting + serverless API routes |
| **Radix UI** | Accessible dialogs, dropdowns, selects |
| **lucide-react** | Icons |
| **sonner** | Toasts |
| **framer-motion** | Light motion on forms/UI |
| **jspdf** | Client-side PDF roadmap export (lazy-loaded) |
| **Vite** | Bundler (via Astro) |

**Env vars:**
- `PUBLIC_FIREBASE_*` — safe for client bundle (Firebase web config)
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY` — **server only**, never `PUBLIC_`

---

## 5. Routes / pages (what the user sees)

| URL | Purpose |
|-----|---------|
| `/` | Landing / marketing |
| `/login` | Google sign-in |
| `/onboarding` | Claim unique username after first login |
| `/dashboard` | Overview / stats |
| `/videos` | Personal video collection (filter/search/status) |
| `/videos/add` | Add video from YouTube URL |
| `/guild` | Connections: send/accept requests |
| `/guild/videos` | Public videos from accepted connections + import |
| `/roadmaps` | Your roadmaps + builder |
| `/roadmaps/connections` | Connections' public roadmaps |
| `/roadmaps/[id]` | Roadmap detail: progress, reorder, edit gate, copy, download, delete |
| `/settings` | One Password setup + account-ish settings |
| `/explore` | Arigato Labs company page |
| `/403` | Forbidden |
| `/api/youtube-meta` | Auth-gated YouTube oEmbed metadata |
| `/api/deletion-security` | Setup / verify / change One Password |
| `/api/delete-resource` | Verify answer + Admin delete video or roadmap |

---

## 6. Features (A → Z of product behavior)

### Auth & onboarding
- Google OAuth via Firebase Auth
- After login, if no username → `/onboarding`
- Username: `3–24` chars, `[a-z0-9_]`, reserved words blocked
- Claimed atomically with a Firestore **transaction** on `users/{uid}` + `usernames/{username}`

### Video collection
- Paste YouTube URL → `/api/youtube-meta` (Bearer token) → title/thumbnail/id
- Duplicate check: deterministic doc id `{uid}_{youtubeId}`
- Fields: category, tags, description, visibility
- Watch status in separate `videoStatuses` collection: `pending | partially_watched | watched`
- **`watched` is locked** — cannot downgrade (UI + Firestore rules)

### Categories
- Defaults in `src/lib/constants.ts` (Music, Gaming, Education, …)
- User prefs on user doc: `customCategories`, `removedCategories`
- `resolveCategories()` merges defaults − removed + custom

### Guild (connections)
- Search usernames (prefix query on `usernames`)
- Send request → `connections/{sortedUidA__sortedUidB}` status `pending`
- Recipient accepts → status `accepted` (only recipient can accept; only `status`/`updatedAt` may change)
- Either participant can delete the connection
- Guild videos page: only **accepted** connections' **public** videos; Import copies into your collection with `sourceVideoId` / `sourceOwnerId`

### Roadmaps
- Ordered list of YouTube steps with per-step status: `pending | not_completed | completed`
- Visibility: `public` (connections) or `private` (owner only)
- Owner can edit (gated by One Password), reorder (gated), update step status
- Completed step status locked in UI
- Non-owner with accepted connection can **copy** → new roadmap with fresh step ids, statuses reset to pending, `sourceRoadmapId` set
- **Download** HTML (self-contained branded page) or PDF (clickable YouTube URLs) via `roadmap-export.ts`

### One Password (deletion / sensitive actions)
- User sets security question + answer in Settings
- Answer stored only as **scrypt hash + salt** in `deletionCredentials` (Admin-only collection; client rules: deny all)
- Used for: delete video/roadmap, unlock roadmap reorder/edit, change credentials
- Lockout: 5 failures → 10 minute lock

### Caching / UX
- `data-cache.ts`: stale-while-revalidate + `sessionStorage` so full page loads still feel instant
- Auth persistence: `browserLocalPersistence` + session flag `seentube:signed-in` + short retry (`waitForAuthUser`) so Astro full navigations don't flash "signed out"
- Firebase singleton on `globalThis.__seentubeFirebase` to survive HMR / multi-island loads
- Astro `ClientRouter` was **removed** because soft navigations were killing the auth session experience

### PWA-ish
- `manifest.webmanifest`, icons, `sw.js`, offline page, meta tags in layout

---

## 7. Real-life use cases

1. **Student** saves course videos, marks progress, builds a roadmap for an exam topic, shares with study partner after connecting.
2. **Self-taught developer** collects tutorials, imports a friend's public picks from Guild, downloads roadmap PDF for offline study.
3. **Creator / mentor** builds a public learning path; mentees copy it into their account and track their own completion.
4. **Anyone** who hates losing links across WhatsApp — one place, searchable, categorized.

---

## 8. Data schemas (Firestore collections)

Schemas are **application-defined** (no SQL migrations). Types live in `src/lib/constants.ts`, `users.ts`, `connections.ts`, `roadmaps.ts`, and Admin credential types in `deletion-security.ts`. Rules in `firestore.rules` enforce ownership and shape constraints.

### `users/{uid}`
| Field | Type | Notes |
|-------|------|-------|
| id | string | = uid |
| name | string | display name |
| email | string | from Google |
| image | string \| null | photo URL |
| username | string | public handle |
| usernameNormalized | string | lowercase |
| customCategories | string[] | optional |
| removedCategories | string[] | optional |
| createdAt, updatedAt | number | epoch ms |

**Access:** get self or pending/accepted connection; **no list**; create/update self only; no delete.

### `usernames/{username}`
| Field | Type |
|-------|------|
| uid | string |
| username | string |
| createdAt | number |

Doc id = username. Enables uniqueness + lookup. Signed-in users can read; create/update/delete only own reservation.

### `connections/{uidA__uidB}`
| Field | Type |
|-------|------|
| participants | [string, string] | **sorted** lexicographically |
| requesterId | string |
| recipientId | string |
| status | `pending` \| `accepted` |
| createdAt, updatedAt | number |

Doc id = `sorted(a,b).join("__")`. Create only as requester with pending. Update only recipient accepting. Delete if participant.

### `videos/{uid}_{youtubeId}`
| Field | Type |
|-------|------|
| videoId | string | YouTube 11-char id |
| title, thumbnail | string |
| channelTitle?, duration? | string |
| category | string |
| tags | string[] |
| description? | string |
| addedBy | string | owner uid |
| visibility | `public` \| `private` |
| sourceVideoId?, sourceOwnerId? | string | set on Guild import |
| createdAt | number |

**Access:** owner always; accepted connection if public; existence get on **own** missing ids (import). Client delete denied (Admin API deletes).

### `videoStatuses/{videoDocId}_{uid}` (or matching own-id pattern)
| Field | Type |
|-------|------|
| videoId | string | Firestore video doc id |
| userId | string |
| status | `pending` \| `partially_watched` \| `watched` |
| progress | number |
| updatedAt | number |

**Lock:** once `watched`, cannot change to another status (rules).

### `roadmaps/{autoId}`
| Field | Type |
|-------|------|
| ownerId | string |
| title | string |
| description | string |
| visibility | `public` \| `private` |
| steps | array of `{ id, url, youtubeId, title, thumbnail, status }` |
| sourceRoadmapId?, sourceOwnerId? | string | copies |
| createdAt, updatedAt | number |

**Access:** owner; or public + accepted connection. Client delete denied.

### `deletionCredentials/{uid}` (Admin only)
| Field | Type |
|-------|------|
| version | number | currently 2 |
| answerHash | string | base64 scrypt |
| answerSalt | string | base64 |
| securityQuestion | string | plain (needed to show user) |
| failureCount | number |
| lockUntil | number |
| createdAt, updatedAt | number |

**Client rules: `allow read, write: if false`.** Only Admin SDK.

---

## 9. Where schemas "come from"

There is no Prisma/SQL schema file. Schemas are defined by:

1. **TypeScript interfaces** (`Video`, `UserProfile`, `Connection`, `Roadmap`, …)
2. **Write sites** in components/libs (`setDoc` / `addDoc` / transactions)
3. **Firestore Security Rules** (field presence, ownership, allowed status values, sorted participants)
4. **Normalizers** (`normalizeRoadmap`, `normalizeUsername`, `parseCategoryPrefs`) that sanitize reads

Composite indexes in `firestore.indexes.json` support queries like:
- videos by `addedBy` + `visibility` (Guild)
- videos by `addedBy` + `videoId` (duplicate checks)
- roadmaps by `ownerId` + `visibility`
- videoStatuses by `videoId` + `userId`

---

## 10. Security steps (what + how)

### A. Auth boundary
- All sensitive pages wait for `waitForAuthUser()`; unsigned users redirect to `/`
- API routes require `Authorization: Bearer <Firebase ID token>` → `verifyIdToken(..., true)` (checks revocation)

### B. Firestore rules as authorization
- No open user list (email harvest prevention)
- Profiles readable only for self / people with pending|accepted connection
- Videos/roadmaps: own OR (public AND accepted connection)
- Connection create requires sorted participants + deterministic id (prevents duplicate pair docs / spoofing)
- Client cannot delete videos/roadmaps (forces One Password path through Admin)
- `deletionCredentials` fully denied to clients
- Catch-all deny: `match /{document=**}`

### C. One Password
- Normalize answer (NFKC, trim, collapse spaces, lowercase)
- **scrypt** + random 16-byte salt; compare with **timingSafeEqual**
- Failure counting + 10-min lock after 5 fails
- Setup is one-shot; change requires verifying current answer

### D. XSS / URL safety
- Roadmap watch links rebuilt from `youtubeId` via `youtubeWatchUrl()` — never trust freeform stored URLs in UI
- HTML export escapes all user text (`escapeHtml`)
- Username suggestions after rules tighten: **do not** fetch stranger profiles (only usernames collection)

### E. API abuse reduction
- YouTube meta endpoint requires sign-in (no anonymous oEmbed proxy)
- Admin private key never in `PUBLIC_` env

### F. Data integrity
- Deterministic video ids → natural duplicate prevention
- Transactions for username claim, status updates, imports, connection accept
- `watched` / completed locks reduce accidental progress loss

---

## 11. How major flows work (step-by-step)

### Add video
1. User pastes URL on `/videos/add`
2. Client gets ID token → `GET /api/youtube-meta?url=...`
3. Server verifies token, extracts YouTube id, calls YouTube oEmbed, returns title/thumbnail
4. Client checks duplicate; on submit writes `videos/{uid}_{youtubeId}` + initial `videoStatuses` doc (batch/transaction)

### Connect + Guild import
1. Lookup `usernames/{name}` → uid
2. `setDoc` connection with sorted participants, status pending
3. Recipient updates status to accepted
4. Videos page queries `addedBy == friend && visibility == public`
5. Import: transaction `get` own destination id; if missing, `set` video + status

### Delete roadmap
1. UI opens `DeletePasswordDialog`
2. User enters One Password answer
3. `POST /api/delete-resource` with Bearer + answer + resource id
4. Server verifies hash; Admin deletes Firestore doc
5. Client invalidates cache, redirects

### Export roadmap
1. Download menu → HTML or PDF
2. Logos fetched + downscaled to data URLs (self-contained file)
3. Localhost origins omit "Open in SeenTube" link
4. Byline: `Real Name (@username)`
5. PDF uses jsPDF `textWithLink` / `link` for clickable YouTube URLs

---

## 12. Debugging playbook (if something breaks)

### Auth "signed out" on every click
1. Check Firebase Auth persistence (`browserLocalPersistence`)
2. Confirm singleton `__seentubeFirebase` still used
3. Confirm Astro soft router (`ClientRouter`) is **not** re-enabled
4. Check `sessionStorage` key `seentube:signed-in`
5. Reproduce with Network tab: is auth restoring after full reload?

### `permission-denied` from Firestore
1. Open `firestore.rules` and match the collection
2. Confirm connection status is `accepted` for Guild/roadmap share
3. Confirm visibility is `public` for non-owner reads
4. For connection create: participants sorted? id = `a__b`?
5. Deployed rules in Console may be stale — paste/publish current `firestore.rules`

### Guild / roadmap queries fail with "index"
1. Check `firestore.indexes.json`
2. Firebase Console → Indexes; create composites if missing
3. Wait until index status is Enabled

### `504 Outdated Optimize Dep` / island hydration fail (dev only)
1. Stale Vite dep cache after `npm install`
2. Stop server, delete `node_modules/.vite`, restart `astro dev`
3. Hard refresh browser (Ctrl+Shift+R)

### YouTube meta 401 / 503
1. 401 → not signed in or token missing `Authorization` header
2. 503 → Admin env vars missing (`FIREBASE_ADMIN_*`)

### One Password "LOCKED" / always invalid
1. 5 fails → wait 10 minutes or Admin reset `lockUntil` / `failureCount`
2. Check normalization (case/spaces) matches how it was stored
3. Confirm `deletionCredentials` only reachable via Admin (rules deny client)

### Import says permission error
1. Rules allow `resource == null` get only if doc id matches own uid prefix
2. Destination id must be `${myUid}_${youtubeId}`

### PDF export looks wrong / huge file
1. Logos should be canvas-downscaled before embed
2. Non-Latin titles may strip in PDF (jsPDF Helvetica/Latin-1 limit); HTML export is the full-Unicode path
3. Confirm dynamic `import("jspdf")` didn't fail network-wise

### General method
1. Reproduce with one user + one friend account
2. Browser console + Network (Firestore REST + `/api/*`)
3. Firebase Console → Authentication / Firestore data / Rules playground
4. Vercel function logs for API routes
5. Narrow: client validation vs rules vs Admin vs third-party (YouTube)

---

## 13. Knowledge you should be able to explain

- SSR vs SPA and why Astro islands
- Firebase Auth ID tokens + Admin `verifyIdToken`
- Firestore Security Rules as the real ACL (not "security through UI")
- Deterministic document IDs for idempotent creates
- Why connection participant arrays are sorted
- Why deletes go through Admin, not client `deleteDoc`
- Password hashing: salt, scrypt, timing-safe compare, lockout
- Stale-while-revalidate caching + sessionStorage across MPA navigations
- XSS: never render untrusted URLs; rebuild from ids; escape HTML exports
- Composite indexes and when Firestore requires them
- Public vs private visibility + accepted-connection sharing model
- Trade-off: client-heavy CRUD with rules vs full custom API backend

---

## 14. Known limitations / honest trade-offs

- Roadmap step "completed" lock is strong in UI; array-field locks in rules are hard — not as airtight as `videoStatuses.watched`
- One Password gates some edits client-side after verify; not every write is re-checked server-side on every field update
- jsPDF fonts don't cover all Unicode scripts
- No email allowlist / invite-only mode (discussed as future Batch C)
- Dev localhost links intentionally omitted from exports
- Relies on correctly **deployed** rules + indexes; repo files alone don't protect production until published

---

## 15. File map (where to look)

| Area | Path |
|------|------|
| Rules | `firestore.rules` |
| Indexes | `firestore.indexes.json` |
| Firebase client | `src/lib/firebase.ts` |
| Auth helpers | `src/lib/auth.ts` |
| Users / username | `src/lib/users.ts` |
| Connections | `src/lib/connections.ts` |
| Roadmaps model | `src/lib/roadmaps.ts` |
| Roadmap export | `src/lib/roadmap-export.ts` |
| Categories | `src/lib/categories.ts` |
| Cache | `src/lib/data-cache.ts` |
| One Password server | `src/lib/server/deletion-security.ts` |
| Delete client | `src/lib/delete-resource.ts` |
| Guild UI | `src/components/GuildVideosClient.tsx` |
| Roadmap detail | `src/components/RoadmapDetailClient.tsx` |
| APIs | `src/pages/api/*.ts` |

---

## 16. Deploy checklist (memory)

1. `npm run build` locally
2. Push + Vercel env: all `PUBLIC_FIREBASE_*` + `FIREBASE_ADMIN_*`
3. Add Vercel domain to Firebase Auth authorized domains
4. Publish **Firestore rules** + **indexes** from repo to Firebase Console
5. Smoke: login → username → add video → connect → guild import → roadmap → One Password delete → HTML/PDF download
