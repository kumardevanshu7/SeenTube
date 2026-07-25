import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, HelpCircle, Loader2, ShieldQuestion, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getDeletionQuestion } from "@/lib/delete-resource";

type DeletePasswordDialogProps = {
  open: boolean;
  resourceName: string;
  resourceLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (answer: string) => Promise<void>;
};

type QuestionState =
  | { status: "loading" }
  | { status: "ready"; question: string }
  | { status: "not-configured" }
  | { status: "error"; message: string };

export default function DeletePasswordDialog({
  open,
  resourceName,
  resourceLabel,
  onOpenChange,
  onConfirm,
}: DeletePasswordDialogProps) {
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [questionState, setQuestionState] = useState<QuestionState>({ status: "loading" });

  useEffect(() => {
    if (!open) {
      setAnswer("");
      setError("");
      setSubmitting(false);
      setQuestionState({ status: "loading" });
      return;
    }

    let active = true;
    setQuestionState({ status: "loading" });
    void (async () => {
      try {
        const security = await getDeletionQuestion();
        if (!active) return;
        if (!security.serverConfigured) {
          setQuestionState({ status: "error", message: "Deletion security is not available right now." });
        } else if (!security.configured || !security.securityQuestion) {
          setQuestionState({ status: "not-configured" });
        } else {
          setQuestionState({ status: "ready", question: security.securityQuestion });
        }
      } catch (caughtError) {
        if (!active) return;
        setQuestionState({
          status: "error",
          message: caughtError instanceof Error ? caughtError.message : "Could not load your security question.",
        });
      }
    })();

    return () => {
      active = false;
    };
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(answer);
      onOpenChange(false);
    } catch (caughtError) {
      setAnswer("");
      setError(caughtError instanceof Error ? caughtError.message : "Deletion failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !submitting && onOpenChange(nextOpen)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[101] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-white p-5 shadow-2xl sm:p-6"
          onEscapeKeyDown={(event) => submitting && event.preventDefault()}
          onPointerDownOutside={(event) => submitting && event.preventDefault()}
        >
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-xl font-bold text-foreground">Delete {resourceLabel}?</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground">{resourceName}</span> will be permanently deleted. This cannot be undone.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary" disabled={submitting} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {questionState.status === "loading" && (
            <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your security question…
            </div>
          )}

          {questionState.status === "not-configured" && (
            <div className="rounded-lg border border-border bg-secondary p-4 text-sm">
              <p className="font-semibold text-foreground">Set up deletion security first</p>
              <p className="mt-1 text-muted-foreground">Add your security question and answer in Settings before deleting anything.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button asChild><a href="/settings"><ShieldQuestion /> Open Settings</a></Button>
              </div>
            </div>
          )}

          {questionState.status === "error" && (
            <div className="rounded-lg border border-border bg-secondary p-4 text-sm">
              <p className="font-medium text-destructive" role="alert">{questionState.message}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
                <Button type="button" onClick={() => setQuestionState({ status: "loading" })}>Try again</Button>
              </div>
            </div>
          )}

          {questionState.status === "ready" && (
            <form onSubmit={handleSubmit}>
              <div className="mb-3 rounded-lg border border-border bg-secondary p-3">
                <div className="flex items-center gap-2 text-primary">
                  <HelpCircle className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-wide">Security question</span>
                </div>
                <p className="mt-1.5 font-semibold text-foreground">{questionState.question}</p>
              </div>

              <label htmlFor="delete-answer" className="mb-2 block text-sm font-semibold">Your answer</label>
              <Input
                id="delete-answer"
                type="text"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type your security answer"
                autoComplete="off"
                autoFocus
                disabled={submitting}
                required
              />
              <div className="mt-2 flex items-start justify-between gap-3">
                <span className="text-xs text-muted-foreground">Capital letters and extra spaces are ignored.</span>
                <a href="/settings" className="shrink-0 text-xs font-semibold text-primary hover:underline">Manage</a>
              </div>
              {error && <p className="mt-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={submitting || !answer.trim()}>
                  {submitting ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
                  {submitting ? "Deleting…" : "Delete permanently"}
                </Button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
