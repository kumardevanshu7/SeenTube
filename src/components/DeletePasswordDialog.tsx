import { useEffect, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, LockKeyhole, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DeletePasswordDialogProps = {
  open: boolean;
  resourceName: string;
  resourceLabel: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (password: string) => Promise<void>;
};

export default function DeletePasswordDialog({
  open,
  resourceName,
  resourceLabel,
  onOpenChange,
  onConfirm,
}: DeletePasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) return;
    setPassword("");
    setError("");
    setSubmitting(false);
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      await onConfirm(password);
      onOpenChange(false);
    } catch (caughtError) {
      setPassword("");
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

          <form onSubmit={handleSubmit}>
            <label htmlFor="delete-password" className="mb-2 block text-sm font-semibold">Deletion password</label>
            <div className="relative">
              <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="delete-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="pl-9" placeholder="Enter your deletion password" autoComplete="current-password" autoFocus disabled={submitting} required />
            </div>
            <div className="mt-2 flex items-start justify-between gap-3">
              <span className="text-xs text-muted-foreground">Your personal password from Settings.</span>
              <a href="/settings" className="shrink-0 text-xs font-semibold text-primary hover:underline">Forgot it?</a>
            </div>
            {error && <p className="mt-2 text-sm font-medium text-destructive" role="alert">{error}</p>}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" variant="destructive" disabled={submitting || !password}>
                {submitting ? <Loader2 className="animate-spin" /> : <AlertTriangle />}
                {submitting ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}