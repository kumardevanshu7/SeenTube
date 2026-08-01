import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  Copy,
  Globe2,
  Loader2,
  Lock,
  Map,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { invalidateCache } from "@/lib/data-cache";
import { deleteProtectedResource, verifyDeletionAnswer } from "@/lib/delete-resource";
import { getConnectionRef, type Connection } from "@/lib/connections";
import {
  getRoadmapProgress,
  makeStepId,
  normalizeRoadmap,
  type Roadmap,
  type RoadmapStep,
  type RoadmapStepStatus,
} from "@/lib/roadmaps";
import RoadmapStepList from "@/components/RoadmapStepList";
import RoadmapDownloadMenu from "@/components/RoadmapDownloadMenu";
import DeletePasswordDialog from "@/components/DeletePasswordDialog";
import SecurityAnswerDialog from "@/components/SecurityAnswerDialog";
import { Button } from "@/components/ui/button";
import { redirectNeedsUsername, redirectSignedOut, waitForAuthUser } from "@/lib/auth";

type DetailState = "loading" | "ready" | "not-found" | "forbidden" | "error";

type RoadmapDetailClientProps = {
  roadmapId: string;
};
export default function RoadmapDetailClient({ roadmapId }: RoadmapDetailClientProps) {
  const [user, setUser] = useState<User | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [ownerName, setOwnerName] = useState("unknown");
  const [ownerFullName, setOwnerFullName] = useState("");
  const [state, setState] = useState<DetailState>("loading");
  const [updatingStepId, setUpdatingStepId] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [draftSteps, setDraftSteps] = useState<RoadmapStep[]>([]);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async () => {
      const signedInUser = await waitForAuthUser();
      if (!active) return;

      if (!signedInUser) {
        redirectSignedOut("/");
        return;
      }
      if (!roadmapId) {
        setState("not-found");
        return;
      }

      setUser(signedInUser);
      try {
        const profileSnapshot = await getDoc(doc(db, "users", signedInUser.uid));
        if (!profileSnapshot.data()?.username) {
          redirectNeedsUsername();
          return;
        }

        const roadmapSnapshot = await getDoc(doc(db, "roadmaps", roadmapId));
        if (!active) return;
        if (!roadmapSnapshot.exists()) {
          setState("not-found");
          return;
        }

        const loadedRoadmap = normalizeRoadmap(roadmapSnapshot.id, roadmapSnapshot.data());
        if (!loadedRoadmap) {
          setState("not-found");
          return;
        }

        if (loadedRoadmap.ownerId !== signedInUser.uid) {
          if (loadedRoadmap.visibility !== "public") {
            setState("forbidden");
            return;
          }
          const connectionSnapshot = await getDoc(getConnectionRef(signedInUser.uid, loadedRoadmap.ownerId));
          const connection = connectionSnapshot.data() as Partial<Connection> | undefined;
          if (
            !connectionSnapshot.exists()
            || connection?.status !== "accepted"
            || !connection.participants?.includes(signedInUser.uid)
            || !connection.participants.includes(loadedRoadmap.ownerId)
          ) {
            setState("forbidden");
            return;
          }
        }

        const ownerSnapshot = await getDoc(doc(db, "users", loadedRoadmap.ownerId));
        if (!active) return;
        const owner = ownerSnapshot.data();
        setOwnerName(owner?.username || owner?.name || "unknown");
        setOwnerFullName(typeof owner?.name === "string" ? owner.name.trim() : "");
        setRoadmap(loadedRoadmap);
        setState("ready");
      } catch (error) {
        if (!active) return;
        console.error("Roadmap detail fetch error:", error);
        const code = (error as { code?: string }).code;
        setState(code === "permission-denied" ? "forbidden" : "error");
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [roadmapId]);

  const updateStepStatus = async (stepId: string, status: RoadmapStepStatus) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !roadmap || roadmap.ownerId !== currentUser.uid || updatingStepId) return;

    const currentStep = roadmap.steps.find((step) => step.id === stepId);
    if (currentStep?.status === "completed" && status !== "completed") {
      toast.error("Completed videos are locked and cannot change status.");
      return;
    }

    setUpdatingStepId(stepId);
    try {
      const roadmapRef = doc(db, "roadmaps", roadmap.id);
      const updatedSteps = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roadmapRef);
        if (!snapshot.exists()) throw new Error("This roadmap no longer exists.");
        const currentRoadmap = normalizeRoadmap(snapshot.id, snapshot.data());
        if (!currentRoadmap || currentRoadmap.ownerId !== currentUser.uid) {
          throw new Error("Only the roadmap owner can update progress.");
        }
        const existingStep = currentRoadmap.steps.find((step) => step.id === stepId);
        if (!existingStep) {
          throw new Error("This video step no longer exists.");
        }
        if (existingStep.status === "completed" && status !== "completed") {
          throw new Error("Completed videos are locked and cannot change status.");
        }
        const steps = currentRoadmap.steps.map((step) => (
          step.id === stepId ? { ...step, status } : step
        ));
        transaction.update(roadmapRef, { steps, updatedAt: Date.now() });
        return steps;
      });
      setRoadmap((current) => current ? { ...current, steps: updatedSteps, updatedAt: Date.now() } : current);
      invalidateCache("roadmaps:");
    } catch (error) {
      console.error("Roadmap status update error:", error);
      toast.error(error instanceof Error ? error.message : "Could not update video status.");
    } finally {
      setUpdatingStepId(null);
    }
  };

  const copyRoadmap = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !roadmap || roadmap.ownerId === currentUser.uid || copying) return;

    setCopying(true);
    try {
      const ownSnapshot = await getDocs(query(
        collection(db, "roadmaps"),
        where("ownerId", "==", currentUser.uid),
      ));
      const existingCopy = ownSnapshot.docs
        .map((snapshot) => normalizeRoadmap(snapshot.id, snapshot.data()))
        .find((item) => item?.sourceRoadmapId === roadmap.id);
      if (existingCopy) {
        toast.info("This roadmap is already in your roadmaps.");
        window.location.assign(`/roadmaps/${encodeURIComponent(existingCopy.id)}`);
        return;
      }

      const destinationRef = doc(collection(db, "roadmaps"));
      const sourceRef = doc(db, "roadmaps", roadmap.id);
      const connectionRef = getConnectionRef(currentUser.uid, roadmap.ownerId);
      const copiedRoadmapId = await runTransaction(db, async (transaction) => {
        const [sourceSnapshot, connectionSnapshot] = await Promise.all([
          transaction.get(sourceRef),
          transaction.get(connectionRef),
        ]);
        if (!sourceSnapshot.exists()) throw new Error("This roadmap no longer exists.");

        const source = normalizeRoadmap(sourceSnapshot.id, sourceSnapshot.data());
        const connection = connectionSnapshot.data() as Partial<Connection> | undefined;
        if (
          !source
          || source.ownerId !== roadmap.ownerId
          || source.visibility !== "public"
          || !connectionSnapshot.exists()
          || connection?.status !== "accepted"
          || !connection.participants?.includes(currentUser.uid)
          || !connection.participants.includes(source.ownerId)
        ) {
          throw new Error("You can only copy a connected user's public roadmap.");
        }

        const now = Date.now();
        transaction.set(destinationRef, {
          ownerId: currentUser.uid,
          title: `${source.title} (Copy)`,
          description: "",
          visibility: "public",
          steps: source.steps.map((step) => ({
            ...step,
            id: makeStepId(),
            status: "pending" as const,
          })),
          sourceRoadmapId: source.id,
          sourceOwnerId: source.ownerId,
          createdAt: now,
          updatedAt: now,
        });
        return destinationRef.id;
      });

      invalidateCache("roadmaps:");
      toast.success("Roadmap copied. Your copy is ready to edit.");
      window.location.assign(`/roadmaps/${encodeURIComponent(copiedRoadmapId)}`);
    } catch (error) {
      console.error("Roadmap copy error:", error);
      toast.error(error instanceof Error ? error.message : "Could not copy this roadmap.");
      setCopying(false);
    }
  };

  const deleteRoadmap = async (password: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || !roadmap || roadmap.ownerId !== currentUser.uid || deleting) {
      throw new Error("Only the roadmap owner can delete it.");
    }

    setDeleting(true);
    try {
      await deleteProtectedResource("roadmap", roadmap.id, password);
      invalidateCache("roadmaps:");
      toast.success("Roadmap deleted");
      window.location.assign("/roadmaps");
    } catch (error) {
      console.error("Protected roadmap deletion failed:", error);
      throw error instanceof Error ? error : new Error("Could not delete this roadmap.");
    } finally {
      setDeleting(false);
    }
  };

  // Unlock reordering only after the owner passes their security answer.
  const confirmReorderAccess = async (answer: string) => {
    await verifyDeletionAnswer(answer);
    setDraftSteps(roadmap ? roadmap.steps.map((step) => ({ ...step })) : []);
    setReorderMode(true);
  };

  const confirmEditAccess = async (answer: string) => {
    await verifyDeletionAnswer(answer);
    if (!roadmap) return;
    window.location.assign(`/roadmaps?edit=${encodeURIComponent(roadmap.id)}`);
  };

  const moveDraftStep = (index: number, direction: -1 | 1) => {
    setDraftSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  const cancelReorder = () => {
    setReorderMode(false);
    setDraftSteps([]);
  };

  const saveOrder = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !roadmap || roadmap.ownerId !== currentUser.uid || savingOrder) return;

    setSavingOrder(true);
    try {
      const roadmapRef = doc(db, "roadmaps", roadmap.id);
      const orderedIds = draftSteps.map((step) => step.id);
      const savedSteps = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(roadmapRef);
        if (!snapshot.exists()) throw new Error("This roadmap no longer exists.");
        const currentRoadmap = normalizeRoadmap(snapshot.id, snapshot.data());
        if (!currentRoadmap || currentRoadmap.ownerId !== currentUser.uid) {
          throw new Error("Only the roadmap owner can reorder videos.");
        }
        // Apply the drafted order to the latest steps, skipping any that were
        // removed elsewhere and appending any that were added in the meantime.
        const byId = new globalThis.Map(currentRoadmap.steps.map((step) => [step.id, step] as const));
        const reordered = orderedIds.flatMap((id) => {
          const step = byId.get(id);
          return step ? [step] : [];
        });
        currentRoadmap.steps.forEach((step) => {
          if (!orderedIds.includes(step.id)) reordered.push(step);
        });
        transaction.update(roadmapRef, { steps: reordered, updatedAt: Date.now() });
        return reordered;
      });
      setRoadmap((current) => current ? { ...current, steps: savedSteps, updatedAt: Date.now() } : current);
      invalidateCache("roadmaps:");
      toast.success("Sequence updated");
      setReorderMode(false);
      setDraftSteps([]);
    } catch (error) {
      console.error("Roadmap reorder error:", error);
      toast.error(error instanceof Error ? error.message : "Could not update the sequence.");
    } finally {
      setSavingOrder(false);
    }
  };

  if (state === "loading") {
    return (
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
        <div className="h-5 w-32 animate-shimmer rounded-md" />
        <div className="h-12 w-3/4 animate-shimmer rounded-md" />
        <div className="h-24 animate-shimmer rounded-lg" />
        {[0, 1, 2].map((item) => <div key={item} className="h-40 animate-shimmer rounded-lg" />)}
      </div>
    );
  }

  if (state !== "ready" || !user || !roadmap) {
    const message = state === "not-found"
      ? "This roadmap does not exist or has been removed."
      : state === "forbidden"
        ? "This roadmap is only available to its owner and accepted connections."
        : "This roadmap could not be loaded right now.";
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-primary">
          {state === "forbidden" ? <Lock className="h-6 w-6" /> : <Map className="h-6 w-6" />}
        </span>
        <h1 className="mt-4 text-2xl font-bold">Roadmap unavailable</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <Button asChild className="mt-6"><a href="/roadmaps"><ArrowLeft /> Back to roadmaps</a></Button>
      </div>
    );
  }

  const isOwner = roadmap.ownerId === user.uid;
  const progress = getRoadmapProgress(roadmap);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-6">
      <a href="/roadmaps" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to roadmaps
      </a>

      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-primary">
              {isOwner ? (roadmap.sourceRoadmapId ? "Your copied roadmap" : "Your roadmap") : `By @${ownerName}`}
            </p>
            <h1 className="text-3xl font-bold sm:text-4xl">{roadmap.title}</h1>
          </div>
          <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-semibold">
            {roadmap.visibility === "public" ? <Globe2 className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            {roadmap.visibility === "public" ? "Public" : "Private"}
          </span>
        </div>

        <section className="rounded-lg border border-border bg-secondary p-4" aria-label="Roadmap progress">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Learning progress</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {progress.completed} of {progress.total} videos completed
              </p>
            </div>
            <strong className="text-2xl text-primary">{progress.percentage}%</strong>
          </div>
          <div
            className="mt-3 h-2.5 overflow-hidden rounded-full bg-white"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percentage}
            aria-label={`${progress.percentage}% complete`}
          >
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress.percentage}%` }} />
          </div>
        </section>
      </header>

      <section aria-labelledby="roadmap-steps-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="roadmap-steps-title" className="text-2xl font-bold">Your learning path</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {reorderMode
                ? "Use the arrows to change the order, then save."
                : isOwner ? "Update each video as you move through the roadmap." : `See @${ownerName}'s current progress.`}
            </p>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">{progress.total} videos</span>
        </div>

        {isOwner && !reorderMode && roadmap.steps.length > 1 && (
          <div className="mb-4">
            <Button type="button" variant="outline" onClick={() => setOrderDialogOpen(true)}>
              <ArrowUpDown /> Change sequence
            </Button>
          </div>
        )}

        {reorderMode ? (
          <>
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
              <ArrowUpDown className="h-4 w-4 shrink-0 text-primary" />
              Reorder mode is unlocked — arrange the videos, then save the sequence.
            </div>
            <RoadmapStepList
              steps={draftSteps}
              editable
              allowRemove={false}
              onMove={moveDraftStep}
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" onClick={cancelReorder} disabled={savingOrder}>Cancel</Button>
              <Button type="button" onClick={saveOrder} disabled={savingOrder}>
                {savingOrder ? <Loader2 className="animate-spin" /> : <Save />}
                {savingOrder ? "Saving…" : "Save sequence"}
              </Button>
            </div>
          </>
        ) : roadmap.steps.length > 0 ? (
          <RoadmapStepList
            steps={roadmap.steps}
            statusEditable={isOwner}
            updatingStepId={updatingStepId}
            onStatusChange={updateStepStatus}
          />
        ) : (
          <p className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            This roadmap has no videos yet.
          </p>
        )}
      </section>

      {!reorderMode && (
      <section className="sticky bottom-20 z-10 space-y-2 rounded-lg border border-border bg-white p-3 shadow-lg lg:static lg:shadow-none" aria-label="Roadmap actions">
        {isOwner ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" size="lg" onClick={() => setEditDialogOpen(true)}>
              <Pencil /> Edit & add videos
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {deleting ? "Deleting…" : "Delete roadmap"}
            </Button>
          </div>
        ) : (
          <Button type="button" size="lg" className="w-full" onClick={copyRoadmap} disabled={copying}>
            {copying ? <Loader2 className="animate-spin" /> : <Copy />}
            {copying ? "Copying roadmap…" : "Copy to My Roadmaps"}
          </Button>
        )}
        <RoadmapDownloadMenu
          roadmap={roadmap}
          ownerName={ownerFullName}
          ownerUsername={ownerName}
          className="w-full"
        />
      </section>
      )}

      {progress.total > 0 && progress.completed === progress.total && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <div><p className="font-bold">Roadmap complete!</p><p className="text-sm">Every video in this learning path is completed.</p></div>
        </div>
      )}

      <DeletePasswordDialog
        open={deleteDialogOpen}
        resourceName={roadmap.title}
        resourceLabel="roadmap"
        onOpenChange={(open) => {
          if (!deleting) setDeleteDialogOpen(open);
        }}
        onConfirm={deleteRoadmap}
      />

      <SecurityAnswerDialog
        open={orderDialogOpen}
        title="Change video sequence"
        description="Enter your One Password answer to unlock reordering for this roadmap."
        confirmLabel="Unlock reordering"
        pendingLabel="Verifying…"
        onOpenChange={setOrderDialogOpen}
        onConfirm={confirmReorderAccess}
      />

      <SecurityAnswerDialog
        open={editDialogOpen}
        title="Edit roadmap"
        description="Enter your One Password answer to edit videos in this roadmap."
        confirmLabel="Continue to edit"
        pendingLabel="Verifying…"
        onOpenChange={setEditDialogOpen}
        onConfirm={confirmEditAccess}
      />
    </div>
  );
}
