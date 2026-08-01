import { useEffect, useRef, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebase";
import { CATEGORIES } from "@/lib/constants";
import {
  getUserCategoryPrefs,
  isBuiltInCategory,
  normalizeCategoryName,
  resolveCategories,
  saveUserCategoryPrefs,
  type UserCategoryPrefs,
} from "@/lib/categories";
import { verifyDeletionAnswer } from "@/lib/delete-resource";
import SecurityAnswerDialog from "@/components/SecurityAnswerDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EditCategoriesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (categories: string[]) => void;
};

type Phase = "gate" | "loading" | "edit";

export default function EditCategoriesDialog({
  open,
  onOpenChange,
  onSaved,
}: EditCategoriesDialogProps) {
  const [phase, setPhase] = useState<Phase>("gate");
  const phaseRef = useRef<Phase>("gate");
  const [prefs, setPrefs] = useState<UserCategoryPrefs>({
    customCategories: [],
    removedCategories: [],
  });
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setPhaseSafe = (next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  };

  useEffect(() => {
    if (!open) {
      setPhaseSafe("gate");
      setNewCategory("");
      setError("");
      setSaving(false);
    }
  }, [open]);

  const loadPrefs = async () => {
    const user = auth.currentUser;
    if (!user) throw new Error("Please sign in again.");
    setPhaseSafe("loading");
    try {
      const loaded = await getUserCategoryPrefs(user.uid);
      setPrefs(loaded);
      setPhaseSafe("edit");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load categories.");
      setPhaseSafe("edit");
    }
  };

  const handleVerified = async (answer: string) => {
    await verifyDeletionAnswer(answer);
    await loadPrefs();
  };

  const categories = resolveCategories(prefs);

  const removeCategory = (name: string) => {
    const clean = normalizeCategoryName(name);
    if (isBuiltInCategory(clean)) {
      setPrefs((current) => ({
        ...current,
        removedCategories: current.removedCategories.includes(clean)
          ? current.removedCategories
          : [...current.removedCategories, clean],
      }));
      return;
    }
    setPrefs((current) => ({
      ...current,
      customCategories: current.customCategories.filter(
        (item) => item.toLowerCase() !== clean.toLowerCase(),
      ),
    }));
  };

  const restoreBuiltIn = (name: string) => {
    const clean = normalizeCategoryName(name);
    setPrefs((current) => ({
      ...current,
      removedCategories: current.removedCategories.filter((item) => item !== clean),
    }));
  };

  const addCustom = (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeCategoryName(newCategory);
    if (!clean) {
      setError("Enter a category name.");
      return;
    }
    if (clean.length > 40) {
      setError("Keep category names under 40 characters.");
      return;
    }
    const existing = resolveCategories(prefs);
    if (existing.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      setError("That category already exists.");
      return;
    }
    if (isBuiltInCategory(clean) && prefs.removedCategories.includes(clean)) {
      restoreBuiltIn(clean);
      setNewCategory("");
      setError("");
      return;
    }
    setPrefs((current) => ({
      ...current,
      customCategories: [...current.customCategories, clean],
    }));
    setNewCategory("");
    setError("");
  };

  const handleSave = async () => {
    const user = auth.currentUser;
    if (!user || saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveUserCategoryPrefs(user.uid, prefs);
      const next = resolveCategories(saved);
      onSaved?.(next);
      toast.success("Categories updated");
      onOpenChange(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not save categories.");
    } finally {
      setSaving(false);
    }
  };

  const removedBuiltIns = CATEGORIES.filter((name) => prefs.removedCategories.includes(name));

  return (
    <>
      <SecurityAnswerDialog
        open={open && phase === "gate"}
        title="Edit categories"
        description="Answer your One Password question to manage categories."
        confirmLabel="Continue"
        pendingLabel="Verifying…"
        onOpenChange={(nextOpen) => {
          // After a successful verify, phase advances before this close fires.
          // Only abort the whole flow if the user cancelled at the gate.
          if (!nextOpen && phaseRef.current === "gate") {
            onOpenChange(false);
          }
        }}
        onConfirm={handleVerified}
      />

      <Dialog.Root
        open={open && (phase === "loading" || phase === "edit")}
        onOpenChange={(nextOpen) => {
          if (!saving) onOpenChange(nextOpen);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[101] flex max-h-[min(90vh,640px)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-white p-5 shadow-2xl sm:p-6"
            onEscapeKeyDown={(event) => saving && event.preventDefault()}
            onPointerDownOutside={(event) => saving && event.preventDefault()}
          >
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Pencil className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title className="text-xl font-bold text-foreground">Edit categories</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Remove built-in categories or add your own custom ones.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
                  disabled={saving}
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </div>

            {phase === "loading" ? (
              <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-8 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {categories.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                      No categories left. Restore a built-in or add a custom one.
                    </p>
                  ) : (
                    categories.map((name) => (
                      <div
                        key={name}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-secondary/40 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{name}</p>
                          <p className="text-xs text-muted-foreground">
                            {isBuiltInCategory(name) ? "Built-in" : "Custom"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => removeCategory(name)}
                          disabled={saving}
                          aria-label={`Remove ${name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {removedBuiltIns.length > 0 && (
                  <div className="mt-4 space-y-2 border-t border-border pt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Removed built-ins
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {removedBuiltIns.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => restoreBuiltIn(name)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold text-foreground hover:border-primary/40"
                        >
                          <RotateCcw className="h-3 w-3 text-primary" />
                          Restore {name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <form onSubmit={addCustom} className="mt-4 border-t border-border pt-4">
                  <label htmlFor="new-category" className="mb-2 block text-sm font-semibold">
                    Add custom category
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="new-category"
                      value={newCategory}
                      onChange={(event) => setNewCategory(event.target.value)}
                      placeholder="e.g. Cooking"
                      maxLength={40}
                      disabled={saving}
                    />
                    <Button type="submit" variant="outline" disabled={saving || !newCategory.trim()}>
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </form>

                {error && (
                  <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : <Pencil />}
                    {saving ? "Saving…" : "Save categories"}
                  </Button>
                </div>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
