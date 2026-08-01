import { onAuthStateChanged, type User } from "firebase/auth";
import { auth, authPersistenceReady } from "@/lib/firebase";
import { getUserProfile, type UserProfile } from "@/lib/users";

const SIGNED_IN_KEY = "seentube:signed-in";
const profileCache = new Map<string, { profile: UserProfile | null; at: number }>();
const PROFILE_TTL_MS = 60_000;

export function markSignedIn() {
  try {
    sessionStorage.setItem(SIGNED_IN_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearSignedIn() {
  try {
    sessionStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    // ignore
  }
  profileCache.clear();
}

function wasSignedIn() {
  try {
    return sessionStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}

export async function getCachedUserProfile(uid: string): Promise<UserProfile | null> {
  const cached = profileCache.get(uid);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;
  const profile = await getUserProfile(uid);
  profileCache.set(uid, { profile, at: Date.now() });
  return profile;
}

/**
 * Resolve the current user after persistence restore.
 * One short retry only when a prior signed-in session is expected.
 */
export async function waitForAuthUser(): Promise<User | null> {
  await authPersistenceReady;
  await auth.authStateReady();

  if (auth.currentUser) {
    markSignedIn();
    return auth.currentUser;
  }

  if (!wasSignedIn()) return null;

  await new Promise((resolve) => setTimeout(resolve, 200));
  await auth.authStateReady();
  if (auth.currentUser) {
    markSignedIn();
    return auth.currentUser;
  }
  return null;
}

type WatchAuthOptions = {
  requireUsername?: boolean;
  onSignedOut?: () => void;
  onNeedsUsername?: (user: User) => void;
  onReady?: (user: User) => void | Promise<void>;
};

/**
 * Subscribe to auth changes without treating restore races as sign-out.
 */
export function watchAuth(options: WatchAuthOptions) {
  let cancelled = false;
  let chain: Promise<void> = Promise.resolve();

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    chain = chain.then(async () => {
      if (cancelled) return;

      let current = user;
      if (!current) {
        current = await waitForAuthUser();
      } else {
        markSignedIn();
      }
      if (cancelled) return;

      if (!current) {
        clearSignedIn();
        options.onSignedOut?.();
        return;
      }

      await handleReady(current);
    }).catch((error) => {
      console.error("Auth watch failed:", error);
    });
  });

  async function handleReady(current: User) {
    markSignedIn();
    if (options.requireUsername === false) {
      await options.onReady?.(current);
      return;
    }

    try {
      const profile = await getCachedUserProfile(current.uid);
      if (cancelled) return;
      if (!profile?.username) {
        options.onNeedsUsername?.(current);
        return;
      }
    } catch (error) {
      console.error("Profile check failed:", error);
      if (cancelled) return;
      options.onNeedsUsername?.(current);
      return;
    }

    await options.onReady?.(current);
  }

  return () => {
    cancelled = true;
    unsubscribe();
  };
}

export function redirectSignedOut(path = "/") {
  if (typeof window === "undefined") return;
  if (window.location.pathname === path) return;
  window.location.replace(path);
}

export function redirectNeedsUsername() {
  if (typeof window === "undefined") return;
  if (window.location.pathname === "/onboarding") return;
  window.location.replace("/onboarding");
}
