import { useEffect, useState, type FormEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { HelpCircle, KeyRound, Loader2, RotateCcw, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "loading" | "setup" | "idle" | "change" | "reset" | "configuration" | "error";
type SecurityResponse = {
  configured?: boolean;
  serverConfigured?: boolean;
  securityQuestion?: string;
  error?: string;
};

export default function DeletionSecuritySettings() {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<Mode>("loading");
  const [savedQuestion, setSavedQuestion] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const request = async (currentUser: User, method: "GET" | "POST", body?: Record<string, string>) => {
    const token = await currentUser.getIdToken();
    const response = await fetch("/api/deletion-security", {
      method,
      headers: { "Authorization": `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.json().catch(() => ({})) as SecurityResponse;
    if (!response.ok) throw new Error(result.error || "Could not load deletion security.");
    return result;
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.replace("/login");
        return;
      }
      setUser(currentUser);
      try {
        const result = await request(currentUser, "GET");
        if (!active) return;
        if (result.serverConfigured === false) {
          setError(result.error || "Firebase Admin setup is required.");
          setMode("configuration");
          return;
        }
        const configured = Boolean(result.configured);
        const existingQuestion = result.securityQuestion || "";
        setSavedQuestion(existingQuestion);
        setQuestion(existingQuestion);
        setMode(configured ? "idle" : "setup");
      } catch (caughtError) {
        if (!active) return;
        setError(caughtError instanceof Error ? caughtError.message : "Could not load settings.");
        setMode("error");
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const clearSensitiveFields = () => {
    setAnswer("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
  };

  const selectMode = (nextMode: Mode) => {
    clearSensitiveFields();
    setQuestion(savedQuestion);
    setMode(nextMode);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || submitting) return;
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      let body: Record<string, string>;
      if (mode === "setup") {
        body = { action: "setup", password: newPassword, question: question.trim(), answer };
      } else if (mode === "change") {
        body = { action: "change", currentPassword, newPassword, question: question.trim(), answer };
      } else {
        body = { action: "reset", answer, newPassword };
      }
      const result = await request(user, "POST", body);
      const updatedQuestion = result.securityQuestion || question.trim() || savedQuestion;
      setSavedQuestion(updatedQuestion);
      setQuestion(updatedQuestion);
      clearSensitiveFields();
      setMode("idle");
      toast.success(mode === "reset" ? "Deletion password reset" : "Deletion security saved");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save settings.");
    } finally {
      setSubmitting(false);
    }
  };

  if (mode === "loading") {
    return (
      <div className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
        <div className="h-10 w-56 animate-shimmer rounded-md" />
        <div className="h-64 animate-shimmer rounded-xl" />
      </div>
    );
  }

  if (mode === "configuration") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <section className="card rounded-xl p-5 sm:p-7">
          <ShieldCheck className="mb-4 h-10 w-10 text-primary" />
          <h1 className="text-2xl font-bold">Firebase Admin setup required</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
          <div className="mt-5 rounded-lg border border-border bg-secondary p-4 font-mono text-xs leading-6 text-foreground">
            <div>FIREBASE_ADMIN_PROJECT_ID=...</div>
            <div>FIREBASE_ADMIN_CLIENT_EMAIL=...</div>
            <div>FIREBASE_ADMIN_PRIVATE_KEY=&quot;-----BEGIN PRIVATE KEY-----\n...&quot;</div>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">Add these server-only values to <code>.env</code>, then restart the dev server. Generate them from Firebase Console → Project Settings → Service accounts.</p>
          <Button className="mt-5" onClick={() => window.location.reload()}>Check configuration again</Button>
        </section>
      </div>
    );
  }

  if (mode === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <ShieldCheck className="mx-auto mb-3 h-9 w-9 text-primary" />
        <h1 className="text-2xl font-bold">Could not load Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-5" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  const isReset = mode === "reset";
  const isChange = mode === "change";
  const isSetup = mode === "setup";
  return (
    <div className="mx-auto max-w-3xl space-y-7 px-4 py-8 sm:px-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Account security</span>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">Deletion <span className="text-primary">Settings</span></h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Set one personal password for deleting your videos and roadmaps. Your security answer can reset it.</p>
      </header>

      {mode === "idle" ? (
        <section className="card rounded-xl p-5 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><ShieldCheck /></span>
            <div>
              <h2 className="text-xl font-bold">Deletion password is active</h2>
              <p className="mt-1 text-sm text-muted-foreground">Videos and roadmaps now require your personal password before permanent deletion.</p>
            </div>
          </div>
          <div className="mt-5 rounded-lg border border-border bg-secondary p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Your security question</p>
            <p className="mt-1 font-semibold text-foreground">{savedQuestion}</p>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => selectMode("change")}><KeyRound /> Change password & question</Button>
            <Button type="button" variant="secondary" onClick={() => selectMode("reset")}><RotateCcw /> Forgot password?</Button>
          </div>
        </section>
      ) : (
        <section className="card rounded-xl p-5 sm:p-7">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">{isSetup ? "First-time setup" : isReset ? "Security answer recovery" : "Update credentials"}</p>
            <h2 className="mt-1 text-2xl font-bold">{isSetup ? "Create deletion password" : isReset ? "Reset deletion password" : "Change deletion security"}</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {isChange && (
              <div>
                <label htmlFor="current-delete-password" className="mb-2 block text-sm font-semibold">Current deletion password</label>
                <Input id="current-delete-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" disabled={submitting} required />
              </div>
            )}

            {isReset ? (
              <div className="rounded-lg border border-border bg-secondary p-4">
                <div className="flex items-center gap-2 text-primary"><HelpCircle className="h-4 w-4" /><span className="text-xs font-bold uppercase tracking-wide">Security question</span></div>
                <p className="mt-2 font-semibold">{savedQuestion}</p>
              </div>
            ) : (
              <div>
                <label htmlFor="security-question" className="mb-2 block text-sm font-semibold">Security question</label>
                <Input id="security-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. What was the name of your first school?" maxLength={160} disabled={submitting} required />
              </div>
            )}

            <div>
              <label htmlFor="security-answer" className="mb-2 block text-sm font-semibold">Security answer</label>
              <Input id="security-answer" type="password" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={isReset ? "Answer your saved question" : "Choose an answer you will remember"} autoComplete="off" maxLength={128} disabled={submitting} required />
              <p className="mt-1.5 text-xs text-muted-foreground">Answer matching ignores capital letters and extra spaces.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="new-delete-password" className="mb-2 block text-sm font-semibold">{isReset ? "New deletion password" : "Deletion password"}</label>
                <Input id="new-delete-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={submitting} required />
              </div>
              <div>
                <label htmlFor="confirm-delete-password" className="mb-2 block text-sm font-semibold">Confirm password</label>
                <Input id="confirm-delete-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={8} maxLength={128} disabled={submitting} required />
              </div>
            </div>
            <p className="-mt-3 text-xs text-muted-foreground">Use at least 8 characters. This is separate from your Google account.</p>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!isSetup && <Button type="button" variant="outline" onClick={() => selectMode("idle")} disabled={submitting}>Cancel</Button>}
              <Button type="submit" disabled={submitting || !answer || !newPassword || !confirmPassword || (!isReset && !question.trim()) || (isChange && !currentPassword)}>
                {submitting ? <Loader2 className="animate-spin" /> : <Save />}
                {submitting ? "Saving…" : isReset ? "Reset password" : "Save deletion security"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <aside className="rounded-xl border border-border bg-secondary p-4 text-sm text-muted-foreground">
        <strong className="text-foreground">Private by design:</strong> your password and answer are salted and hashed on the server. SeenTube never stores or returns their plain text.
      </aside>
    </div>
  );
}