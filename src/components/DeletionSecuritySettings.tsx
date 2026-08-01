import { useEffect, useState, type FormEvent } from "react";
import { type User } from "firebase/auth";
import { HelpCircle, KeyRound, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { redirectSignedOut, watchAuth } from "@/lib/auth";

type Mode = "loading" | "setup" | "idle" | "change" | "configuration" | "error";
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
  const [currentAnswer, setCurrentAnswer] = useState("");
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
    if (!response.ok) throw new Error(result.error || "Could not load One Password.");
    return result;
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = watchAuth({
      requireUsername: false,
      onSignedOut: () => redirectSignedOut("/login"),
      onReady: async (currentUser) => {
        if (!active) return;
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
      },
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const clearSensitiveFields = () => {
    setAnswer("");
    setCurrentAnswer("");
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
    if (!question.trim()) {
      setError("Enter a security question.");
      return;
    }
    if (!answer.trim()) {
      setError("Enter a security answer.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const body: Record<string, string> = mode === "setup"
        ? { action: "setup", question: question.trim(), answer }
        : { action: "change", currentAnswer, question: question.trim(), answer };
      const result = await request(user, "POST", body);
      const updatedQuestion = result.securityQuestion || question.trim() || savedQuestion;
      setSavedQuestion(updatedQuestion);
      setQuestion(updatedQuestion);
      clearSensitiveFields();
      setMode("idle");
      toast.success("One Password saved");
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

  const isChange = mode === "change";
  const isSetup = mode === "setup";
  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <KeyRound className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Account security</span>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">One <span className="text-primary">Password</span></h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground sm:text-base">
          Set one question and one answer. SeenTube will ask for it before edits, deletes, and other protected actions. No PIN or pattern — just Q&amp;A.
        </p>
      </header>

      {mode === "idle" ? (
        <section className="rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold">One Password is active</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Category edits, roadmap edits, deletes, and reordering require your answer first.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-border bg-secondary/70 px-3.5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your question</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{savedQuestion}</p>
          </div>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => selectMode("change")}>
              <KeyRound /> Change question &amp; answer
            </Button>
            <p className="text-xs text-muted-foreground sm:max-w-xs sm:text-right">
              Your answer is salted and hashed on the server. Plain text is never stored.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-border bg-white p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">{isSetup ? "First-time setup" : "Update One Password"}</p>
            <h2 className="mt-1 text-xl font-bold sm:text-2xl">{isSetup ? "Create your One Password" : "Change your One Password"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">One question. One answer. That&apos;s it.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isChange && (
              <div className="rounded-lg border border-border bg-secondary/70 p-4">
                <div className="flex items-center gap-2 text-primary">
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">Answer current question to continue</span>
                </div>
                <p className="mt-2 font-semibold">{savedQuestion}</p>
                <label htmlFor="current-answer" className="mt-3 mb-2 block text-sm font-semibold">Current answer</label>
                <Input id="current-answer" type="text" value={currentAnswer} onChange={(event) => setCurrentAnswer(event.target.value)} placeholder="Answer your current question" autoComplete="off" disabled={submitting} required />
              </div>
            )}

            <div>
              <label htmlFor="security-question" className="mb-2 block text-sm font-semibold">Your question</label>
              <Input id="security-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. What was the name of your first school?" maxLength={160} disabled={submitting} required />
            </div>

            <div>
              <label htmlFor="security-answer" className="mb-2 block text-sm font-semibold">Your answer</label>
              <Input id="security-answer" type="text" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Choose an answer you will remember" autoComplete="off" disabled={submitting} required />
              <p className="mt-1.5 text-xs text-muted-foreground">Any answer works. Capital letters and extra spaces are ignored when matching.</p>
            </div>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {!isSetup && <Button type="button" variant="outline" onClick={() => selectMode("idle")} disabled={submitting}>Cancel</Button>}
              <Button type="submit" disabled={submitting || !question.trim() || !answer.trim() || (isChange && !currentAnswer.trim())}>
                {submitting ? <Loader2 className="animate-spin" /> : <Save />}
                {submitting ? "Saving…" : "Save One Password"}
              </Button>
            </div>
          </form>

          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            <strong className="text-foreground">Private by design:</strong> your answer is salted and hashed on the server. SeenTube never stores or returns its plain text.
          </p>
        </section>
      )}
    </div>
  );
}
