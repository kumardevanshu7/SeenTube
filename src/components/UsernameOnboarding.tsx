import { useEffect, useRef, useState, type FormEvent } from "react";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  claimUsername,
  getUserProfile,
  normalizeUsername,
  validateUsername,
} from "@/lib/users";
import { clearSignedIn, markSignedIn, redirectSignedOut, waitForAuthUser } from "@/lib/auth";

type ScreenState = "checking" | "ready" | "error";

function buildSuggestion(user: User) {
  const source = user.displayName || user.email?.split("@")[0] || "user";
  const suffix = user.uid.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "member";
  let suggestion = normalizeUsername(source)
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24)
    .replace(/_+$/g, "");

  if (suggestion.length < 3) suggestion = `${suggestion || "user"}_${suffix}`.slice(0, 24);
  if (validateUsername(suggestion)) suggestion = `user_${suffix}`.slice(0, 24);
  return suggestion;
}

export default function UsernameOnboarding() {
  const [screen, setScreen] = useState<ScreenState>("checking");
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [checkingError, setCheckingError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async () => {
      const signedInUser = await waitForAuthUser();
      if (!active) return;

      if (!signedInUser) {
        redirectSignedOut("/login");
        return;
      }

      markSignedIn();
      setUser(signedInUser);
      try {
        const profile = await getUserProfile(signedInUser.uid);
        if (!active) return;
        if (profile?.username || profile?.usernameNormalized) {
          window.location.replace("/dashboard");
          return;
        }
        setUsername(buildSuggestion(signedInUser));
        setScreen("ready");
      } catch (error) {
        console.error("Unable to check username profile:", error);
        if (!active) return;
        setCheckingError("We couldn’t check your profile. Check your connection and try again.");
        setScreen("error");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const validationError = username ? validateUsername(username) : "Choose a username to continue.";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || submitLock.current) return;

    const normalized = normalizeUsername(username);
    const error = validateUsername(normalized);
    if (error) {
      setSubmitError(error);
      return;
    }

    submitLock.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await claimUsername(user, normalized);
      window.location.assign("/dashboard");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "We couldn’t save your username. Please try again.");
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (submitting) return;
    try {
      clearSignedIn();
      await signOut(auth);
    } finally {
      window.location.assign("/login");
    }
  };

  if (screen === "checking") {
    return (
      <main className="min-h-screen bg-white px-5 py-10 text-[#171717]">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <div className="flex items-center gap-3 text-sm font-medium text-neutral-600" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-200 border-t-[#ff385c]" />
            Checking your account…
          </div>
        </div>
      </main>
    );
  }

  if (screen === "error") {
    return (
      <main className="min-h-screen bg-white px-5 py-10 text-[#171717]">
        <div className="mx-auto flex min-h-[70vh] max-w-md items-center justify-center">
          <section className="w-full rounded-3xl border border-neutral-200 bg-white p-7 text-center shadow-[0_24px_70px_rgba(23,23,23,0.08)]">
            <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0f3] text-[#ff385c]">
              <span className="text-xl font-bold">!</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{checkingError}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-6 h-12 w-full rounded-xl bg-[#ff385c] px-5 text-sm font-semibold text-white transition hover:bg-[#e8294f] focus:outline-none focus:ring-4 focus:ring-[#ff385c]/20">
              Try again
            </button>
            <button type="button" onClick={handleSignOut} className="mt-3 text-sm font-semibold text-neutral-600 hover:text-[#171717]">
              Sign out and go back
            </button>
          </section>
        </div>
      </main>
    );
  }

  const displayName = user?.displayName || user?.email?.split("@")[0] || "SeenTube member";
  const initial = displayName.charAt(0).toUpperCase();
  const isValid = !validationError;

  return (
    <main className="relative min-h-screen overflow-hidden bg-white px-4 py-6 text-[#171717] sm:px-6 sm:py-10">
      <div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#ff385c]/[0.07] blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-28 -left-28 h-72 w-72 rounded-full bg-neutral-100 blur-3xl" />

      <div className="relative mx-auto max-w-lg">
        <header className="mb-8 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-bold tracking-tight" aria-label="SeenTube home">
            <img src="/icons/icon-192.png" alt="" aria-hidden="true" className="h-9 w-9 rounded-xl object-contain" />
            SeenTube
          </a>
          <button type="button" onClick={handleSignOut} disabled={submitting} className="rounded-lg px-3 py-2 text-sm font-semibold text-neutral-500 transition hover:bg-neutral-100 hover:text-[#171717] disabled:cursor-not-allowed disabled:opacity-50">
            Sign out
          </button>
        </header>

        <section className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_24px_80px_rgba(23,23,23,0.09)] sm:p-8">
          <div className="mb-7 flex items-center gap-3 rounded-2xl bg-neutral-50 p-3.5">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-12 w-12 rounded-full object-cover ring-2 ring-white" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ff385c] font-bold text-white ring-2 ring-white">{initial}</div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{displayName}</p>
              <p className="truncate text-xs text-neutral-500">{user?.email}</p>
            </div>
            <svg className="ml-auto h-5 w-5 shrink-0 text-[#ff385c]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-label="Google account connected"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg>
          </div>

          <div className="mb-7">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-[#ff385c]">One last step</p>
            <h1 className="text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Choose your username</h1>
            <p className="mt-3 text-sm leading-6 text-neutral-600 sm:text-base">
              Your username is public and identifies you in Guild Videos and shared roadmaps.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="username" className="mb-2 block text-sm font-bold">Username</label>
            <div className={`flex h-14 items-center rounded-xl border bg-white px-4 transition focus-within:ring-4 ${submitError || validationError ? "border-neutral-300 focus-within:border-[#ff385c] focus-within:ring-[#ff385c]/10" : "border-emerald-500 focus-within:border-emerald-500 focus-within:ring-emerald-500/10"}`}>
              <span className="select-none text-lg font-semibold text-neutral-400">@</span>
              <input
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(event) => {
                  setUsername(normalizeUsername(event.target.value));
                  setSubmitError("");
                }}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                maxLength={24}
                disabled={submitting}
                aria-invalid={Boolean(submitError || validationError)}
                aria-describedby="username-feedback username-help"
                className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-base font-semibold outline-none placeholder:text-neutral-300 disabled:cursor-not-allowed"
                placeholder="your_username"
                autoFocus
              />
              {isValid && !submitError && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600" aria-label="Valid username">✓</span>}
            </div>

            <div id="username-feedback" aria-live="polite" className="mt-2 min-h-5 text-xs">
              {submitError ? <p className="font-medium text-red-600">{submitError}</p> : validationError ? <p className="text-neutral-500">{validationError}</p> : <p className="font-medium text-emerald-600">Looks good — this username is valid.</p>}
            </div>
            <p id="username-help" className="mt-1 text-xs text-neutral-400">3–24 lowercase letters, numbers, or underscores.</p>

            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Public preview</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ff385c] text-sm font-bold text-white">{initial}</div>
                <div>
                  <p className="text-sm font-bold">{displayName}</p>
                  <p className="text-sm font-medium text-[#ff385c]">@{username || "your_username"}</p>
                </div>
              </div>
            </div>

            <button type="submit" disabled={submitting || Boolean(validationError)} className="mt-6 flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[#ff385c] px-5 text-sm font-bold text-white shadow-[0_10px_25px_rgba(255,56,92,0.22)] transition hover:bg-[#e8294f] focus:outline-none focus:ring-4 focus:ring-[#ff385c]/20 disabled:cursor-not-allowed disabled:bg-neutral-300 disabled:shadow-none">
              {submitting ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Claiming username…</>
              ) : (
                <>Continue to dashboard <span aria-hidden="true">→</span></>
              )}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-xs leading-5 text-neutral-400">
          You can change your username later, subject to availability.
        </p>
      </div>
    </main>
  );
}
