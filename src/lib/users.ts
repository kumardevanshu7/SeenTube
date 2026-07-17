import type { User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string;
  usernameNormalized: string;
  createdAt: number;
  updatedAt: number;
}

const USERNAME_PATTERN = /^[a-z0-9_]{3,24}$/;
const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "api", "guild", "help", "login", "onboarding",
  "roadmaps", "root", "seentube", "support", "system", "videos",
]);

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

export function validateUsername(value: string): string | null {
  const username = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(username)) {
    return "Use 3–24 lowercase letters, numbers, or underscores.";
  }
  if (RESERVED_USERNAMES.has(username)) return "This username is reserved.";
  return null;
}

export async function getUserProfile(uid: string) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? ({ id: uid, ...snapshot.data() } as UserProfile) : null;
}

export async function claimUsername(user: FirebaseUser, value: string) {
  const username = normalizeUsername(value);
  const validationError = validateUsername(username);
  if (validationError) throw new Error(validationError);

  const profileRef = doc(db, "users", user.uid);
  const usernameRef = doc(db, "usernames", username);

  await runTransaction(db, async (transaction) => {
    const [profileSnapshot, usernameSnapshot] = await Promise.all([
      transaction.get(profileRef),
      transaction.get(usernameRef),
    ]);
    const reservation = usernameSnapshot.data();
    if (usernameSnapshot.exists() && reservation?.uid !== user.uid) {
      throw new Error("That username is already taken.");
    }

    const previousUsername = profileSnapshot.data()?.usernameNormalized;
    if (previousUsername && previousUsername !== username) {
      transaction.delete(doc(db, "usernames", previousUsername));
    }

    const now = Date.now();
    transaction.set(usernameRef, { uid: user.uid, username, createdAt: now });
    transaction.set(profileRef, {
      id: user.uid,
      name: user.displayName || user.email?.split("@")[0] || username,
      email: user.email || "",
      image: user.photoURL || null,
      username,
      usernameNormalized: username,
      createdAt: profileSnapshot.data()?.createdAt || now,
      updatedAt: now,
    }, { merge: true });
  });

  return username;
}