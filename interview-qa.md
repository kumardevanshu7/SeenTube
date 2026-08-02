# SeenTube — Interview Q&A (Speak Script)

> Short, precise answers in simple language.
> **Bold opening line** = say this first. Rest = only if they ask follow-up.
> Medium answers marked ★ (important). Everything else stays short.

---

## 30-second pitch

**"SeenTube is a personal YouTube collection app with friend sharing and ordered learning roadmaps."**

You save videos, track watch progress, connect with people by username, see only accepted friends' public videos, and build step-by-step learning paths you can share, copy, or download as PDF/HTML. Built with Astro, React, TypeScript, Firebase, and Tailwind; hosted on Vercel.

---

## Why / product

### Why did you build this?
**"I kept losing useful YouTube videos in chats and notes, and playlists don't give friend-gated sharing plus personal progress."**

I wanted one place: my collection, my progress, ordered learning paths, and share only with people I connect with — not a public social feed.

### What problem does it solve in real life?
**"Structured saving and learning from YouTube with trusted sharing."**

Students or self-learners can organize videos, follow a roadmap in order, and share paths with a study partner after connecting — without making everything public.

### Who is the user?
**"Anyone who saves educational or reference YouTube videos — especially learners who study with a friend."**

### Why not just YouTube playlists?
**"Playlists don't give connection-based privacy, separate personal progress on a copied path, or One-Password-protected deletes the way I designed."**

Also no Guild-style import into *your* collection with your own status.

---

## Architecture ★

### Explain the architecture in simple words
**"Browser talks to Firebase for most data; sensitive actions go through my Vercel API with Admin SDK."**

Astro pages + React islands in the UI. Firestore Security Rules decide who can read/write. Deletes and the security-question hashes never go through the client database API.

### Why Astro + React instead of only Next.js / only SPA?
**"Astro gives fast pages; React islands handle the interactive parts only."**

I didn't need a full SPA for every route. SSR on Vercel also supports my API routes.

### Why Firebase?
**"Auth + database + security rules without building a full custom backend for every CRUD."**

For secrets and deletes I still use Admin on the server — best of both.

### What runs on the server vs client?
**"Client: normal reads/writes to Firestore under rules. Server: verify tokens, One Password hashes, deletes, YouTube metadata."**

---

## Auth

### How does login work?
**"Google sign-in through Firebase Auth, then claim a unique username."**

Username is reserved in a `usernames` collection so two people can't take the same handle.

### How do you keep the user logged in across Astro page navigations?
**"Local persistence plus a small session flag and a short retry while Auth restores."**

I also keep one Firebase app instance on `globalThis` so islands don't create multiple Auth clients. Soft client routing that broke the session was removed.

### What is an ID token and where do you use it?
**"It's proof from Firebase that this browser is that user — my APIs check it with Admin `verifyIdToken`."**

---

## Data model / schemas ★

### What collections do you have?
**"users, usernames, connections, videos, videoStatuses, roadmaps, and Admin-only deletionCredentials."**

### How is a video ID chosen?
**"`{userId}_{youtubeVideoId}` — deterministic."**

Same user can't add the same YouTube video twice; import also uses that destination id.

### How do connections work?
**"One doc per pair: sorted uids joined like `a__b`, status pending then accepted."**

Only the recipient can accept. Sharing videos/roadmaps requires **accepted** + often **public** visibility.

### Why sort participant uids?
**"So A→B and B→A map to the same document — no duplicate friendships."**

### Where do schemas come from? Any Prisma?
**"No SQL ORM — TypeScript types + write code + Firestore rules define the schema."**

### What indexes do you need?
**"Composites for queries like videos by owner+visibility, owner+youtubeId, roadmaps by owner+visibility, statuses by video+user."**

Without them Firestore rejects the query.

---

## Features (quick)

### How does adding a video work?
**"Paste URL → authenticated API fetches title/thumbnail → save to Firestore if not duplicate."**

### What is Guild?
**"The connections area: friend requests, then browse friends' public videos and import them."**

### How do roadmaps work?
**"Ordered YouTube steps with progress; public ones visible to accepted connections; can copy or download."**

### What is One Password?
**"A personal security question whose answer is hashed on the server — needed for deletes and some sensitive edits."**

### HTML vs PDF download?
**"HTML is a nice offline page with buttons; PDF shows clickable YouTube links. Both credit Arigato Labs; no progress bar in exports."**

---

## Security ★

### How do you secure user data?
**"Firestore Security Rules are the real gate — UI checks are not enough."**

Examples: no listing all users; profiles only for self/connections; videos only own or friends' public; credential collection denied to clients.

### How is the security answer stored?
**"Never plain text — scrypt hash with a random salt, compared with timing-safe equal."**

Five wrong tries lock for ten minutes.

### Why can't the client delete videos directly?
**"Rules deny client delete; only the Admin API deletes after verifying One Password."**

Stops a stolen session from wiping data with one `deleteDoc`.

### How do you prevent XSS from roadmap links?
**"UI builds YouTube URLs from the video id, not from arbitrary stored strings; HTML export escapes text."**

### What's the difference between public Firebase keys and Admin keys?
**"Public web config is meant for the browser; Admin private key stays server-only in env vars."**

---

## Performance / caching

### How do you reduce Firestore reads?
**"Short-lived cache in memory plus sessionStorage so revisiting a page doesn't always refetch."**

Invalidate on writes. Guild page only loads videos when you're on the videos mode.

### Why lazy-load jsPDF?
**"PDF library is big — load it only when the user downloads a PDF."**

---

## Debugging ★

### Firestore `permission-denied` — what do you check?
**"Rules + whether connection is accepted + visibility + whether production rules were actually published."**

### App says logged out randomly — what do you check?
**"Auth persistence, Firebase singleton, no soft router killing session, session flag retry."**

### Dev `504 Outdated Optimize Dep`?
**"Vite cache stale after install — clear `.vite`, restart dev server, hard refresh."**

### Index error on query?
**"Add/deploy the composite index from `firestore.indexes.json` and wait until enabled."**

### One Password always fails?
**"Lockout, wrong normalization, or Admin env not configured — check server logs and credential doc via Admin."**

---

## Trade-offs / honesty

### What would you improve next?
**"Stronger server-side checks on more write paths, better Unicode PDF fonts, maybe invite-only / allowlist if needed."**

### Biggest technical challenge?
**"Getting sharing right: friend-gated reads without letting people scrape all users or probe private docs — and keeping Auth stable on a multi-page Astro app."**

### Why Security Rules over only a custom API?
**"Client apps still need a hard server-side ACL; Rules enforce that on every read/write without proxying all traffic."**

Sensitive secrets still stay on Admin APIs.

---

## Behavioral / ownership

### What are you most proud of?
**"The connection-gated sharing model plus One Password deletes — product feels private-first, and destructive actions aren't a fake confirm dialog."**

### Did you deploy it?
**"Yes — Vercel for the app, Firebase for Auth/Firestore; rules and indexes must be published separately."**

### Solo or team?
**"Solo project under Arigato Labs."**

---

## Ultra-short cheat sheet (memorize)

| Topic | One line |
|-------|----------|
| Product | YouTube collection + friend share + roadmaps |
| Stack | Astro, React, TS, Firebase, Tailwind, Vercel |
| Auth | Google + unique username |
| Share model | Accepted connection + public visibility |
| Video id | `uid_youtubeId` |
| Connection id | sorted `uidA__uidB` |
| Deletes | Admin API + scrypt One Password |
| Rules | Real security; UI is not enough |
| Cache | Memory + sessionStorage SWR |
| Export | HTML buttons / PDF clickable links |

---

## If they say "walk me through the code"

1. Login → `users` + `usernames`  
2. Add video → `/api/youtube-meta` → `videos` + `videoStatuses`  
3. Connect → `connections` pending → accepted  
4. Guild → query friend public videos → import own id  
5. Roadmap → `roadmaps` steps → detail page → optional copy/export  
6. Delete → `/api/delete-resource` after hash verify  

Keep each step one sentence unless they dig in.
