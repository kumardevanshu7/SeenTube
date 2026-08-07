# SeenTube

A collaborative YouTube collection and learning-roadmap app built with Astro 5, React 19, Firebase Authentication, Firestore, and Tailwind CSS 4.

> **Note**: This project falls under **Arigato Labs**.

## Features
- Google sign-in with unique public usernames
- Personal video collection and watch-status tracking
- Connection requests with accept/decline controls
- Accepted-connections-only Guild videos and roadmap sharing
- Duplicate-safe video imports
- Ordered YouTube learning roadmaps
- Responsive desktop and mobile navigation
- Company pages: About, Privacy, Terms, Disclaimer, Contact

## Local setup
1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Add your Firebase Web App configuration to `.env`
4. Run `npm run dev`

Required variables:
```env
PUBLIC_FIREBASE_API_KEY=your_firebase_web_api_key
PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
PUBLIC_FIREBASE_PROJECT_ID=your-project-id
PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
PUBLIC_FIREBASE_APP_ID=your_firebase_app_id
```

`PUBLIC_` variables are intentionally included in the client bundle. Do not place Firebase Admin private keys, OAuth client secrets, deletion passwords, or security answers in a `PUBLIC_` variable.

Protected video and roadmap deletion requires these **server-only** Firebase Admin variables in local `.env` and Vercel:
```env
FIREBASE_ADMIN_PROJECT_ID=your-project-id
FIREBASE_ADMIN_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```
Create the Admin credentials in **Firebase Console → Project Settings → Service accounts**. Each user then opens **Settings** and creates a personal deletion password, security question, and answer. Passwords and answers are stored only as salted server-side hashes.

Contact form delivery (optional but required for `/contact` to send mail) uses [Web3Forms](https://web3forms.com) with founder inbox `kumardevanshu3001@gmail.com`:
```env
PUBLIC_WEB3FORMS_KEY=your_web3forms_access_key_here
```

The deployed Firestore rules must block all browser access to this Admin-only collection:
```text
match /deletionCredentials/{userId} {
  allow read, write: if false;
}
```
Merge this block into the existing `match /databases/{database}/documents` section. Firebase Admin APIs continue to work because Admin credentials bypass client rules.

## Deploy to Vercel
SeenTube uses the official [`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/) adapter because the app has SSR and API routes.

1. Push the repository to GitHub. `.env`, `.env.*`, `.vercel/`, private keys, and local databases are ignored.
2. Import the repository in Vercel.
3. Add all six `PUBLIC_FIREBASE_*` keys, `PUBLIC_WEB3FORMS_KEY`, and the three server-only `FIREBASE_ADMIN_*` values under **Project Settings → Environment Variables** for Production and Preview as needed.
4. Deploy using Vercel's detected `npm run build` command.
5. Add the production Vercel domain to **Firebase Console → Authentication → Settings → Authorized domains**.

Run `npm run build` locally before deploying. Firestore Security Rules remain the production authorization boundary for user data and accepted connections.

## Commands
- `npm run dev` — local development
- `npm run build` — production build
- `npm run preview` — preview the built output

Content was rephrased for compliance with licensing restrictions.

---
*Created as part of Arigato Labs. Copyright © 2026 Arigato Labs. All Rights Reserved.*
