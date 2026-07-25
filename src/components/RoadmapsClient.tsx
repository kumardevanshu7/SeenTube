import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  where,
} from "firebase/firestore";
import {
  ChevronRight,
  Globe2,
  Link2,
  Loader2,
  Lock,
  Map,
  Plus,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { invalidateCache } from "@/lib/data-cache";
import { getUserConnectionDocuments } from "@/lib/connections";
import {
  getRoadmapProgress,
  makeStepId,
  normalizeRoadmap,
  timeValue,
  type Roadmap,
  type RoadmapStep,
  type RoadmapStepStatus,
  type Visibility,
} from "@/lib/roadmaps";
import RoadmapStepList from "@/components/RoadmapStepList";
import BrandLoader from "@/components/BrandLoader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type YoutubeMeta = Pick<RoadmapStep, "youtubeId" | "title" | "thumbnail"> & {
  error?: string;
};
function RoadmapSummaryCard({
  roadmap,
  ownerName,
  isOwner,
}: {
  roadmap: Roadmap;
  ownerName: string;
  isOwner: boolean;
}) {
  const progress = getRoadmapProgress(roadmap);
  const preview = roadmap.steps[0];
  const label = isOwner
    ? (roadmap.sourceRoadmapId ? "Your copied roadmap" : "Your roadmap")
    : `By @${ownerName}`;

  return (
    <article className="card group h-full overflow-hidden rounded-lg">
      <a
        href={`/roadmaps/${encodeURIComponent(roadmap.id)}`}
        className="flex h-full flex-col"
        aria-label={`Open ${roadmap.title}, ${progress.percentage}% complete`}
      >
        <div className="relative aspect-[16/8] overflow-hidden bg-secondary">
          {preview ? (
            <img
              src={preview.thumbnail || `https://img.youtube.com/vi/${preview.youtubeId}/hqdefault.jpg`}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.src = `https://img.youtube.com/vi/${preview.youtubeId}/hqdefault.jpg`;
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-primary"><Map className="h-10 w-10" /></div>
          )}
          <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-semibold">
            {roadmap.visibility === "public" ? <Globe2 className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {roadmap.visibility === "public" ? "Public" : "Private"}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4 sm:p-5">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">{label}</p>
          <div className="mt-1 flex items-start justify-between gap-3">
            <h3 className="line-clamp-2 text-xl font-bold group-hover:text-primary">{roadmap.title}</h3>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {progress.total} video{progress.total === 1 ? "" : "s"} in this learning path
          </p>

          <div className="mt-auto pt-5">
            <div className="mb-2 flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold">{progress.completed} of {progress.total} completed</span>
              <strong className="text-primary">{progress.percentage}%</strong>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.percentage}
              aria-label={`${progress.percentage}% complete`}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress.percentage}%` }} />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground group-hover:text-primary">Open roadmap</p>
          </div>
        </div>
      </a>
    </article>
  );
}

export default function RoadmapsClient() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roadmaps, setRoadmaps] = useState<Roadmap[]>([]);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [showBuilder, setShowBuilder] = useState(false);
  const [roadmapTitle, setRoadmapTitle] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [showVideoInput, setShowVideoInput] = useState(true);
  const [steps, setSteps] = useState<RoadmapStep[]>([]);
  const [editingRoadmapId, setEditingRoadmapId] = useState<string | null>(null);
  const [editingVisibility, setEditingVisibility] = useState<Visibility>("public");
  const [addingStep, setAddingStep] = useState(false);
  const [saving, setSaving] = useState(false);
  const handledEditId = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!currentUser) {
        window.location.replace("/");
        return;
      }

      setUser(currentUser);
      try {
        const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (!profileSnapshot.data()?.username) {
          window.location.replace("/onboarding");
          return;
        }

        const connectionDocuments = await getUserConnectionDocuments(currentUser.uid);
        const acceptedOwnerIds = Array.from(new Set(
          connectionDocuments.flatMap((connectionDocument) => {
            const connection = connectionDocument.data();
            if (connection.status !== "accepted" || !Array.isArray(connection.participants)) return [];
            const otherUid = connection.participants.find((uid: unknown) => (
              typeof uid === "string" && uid !== currentUser.uid
            ));
            return typeof otherUid === "string" ? [otherUid] : [];
          }),
        ));

        const roadmapsRef = collection(db, "roadmaps");
        const [ownSnapshot, connectedSnapshots] = await Promise.all([
          getDocs(query(roadmapsRef, where("ownerId", "==", currentUser.uid))),
          Promise.all(acceptedOwnerIds.map((ownerId) => getDocs(query(
            roadmapsRef,
            where("ownerId", "==", ownerId),
            where("visibility", "==", "public"),
          )))),
        ]);
        if (!active) return;

        const merged = new globalThis.Map<string, Roadmap>();
        ownSnapshot.docs.forEach((snapshot) => {
          const roadmap = normalizeRoadmap(snapshot.id, snapshot.data());
          if (roadmap) merged.set(snapshot.id, roadmap);
        });
        connectedSnapshots.forEach((snapshot) => {
          snapshot.docs.forEach((roadmapSnapshot) => {
            const roadmap = normalizeRoadmap(roadmapSnapshot.id, roadmapSnapshot.data());
            if (roadmap?.visibility === "public") merged.set(roadmapSnapshot.id, roadmap);
          });
        });
        const loadedRoadmaps = Array.from(merged.values()).sort(
          (a, b) => timeValue(b.updatedAt) - timeValue(a.updatedAt),
        );

        const ownerIds = Array.from(new Set(loadedRoadmaps.map((roadmap) => roadmap.ownerId)));
        const ownerProfiles = await Promise.all(ownerIds.map(async (ownerId) => {
          const snapshot = await getDoc(doc(db, "users", ownerId));
          const owner = snapshot.data();
          return [ownerId, owner?.username || owner?.name || "unknown"] as const;
        }));
        if (!active) return;

        setRoadmaps(loadedRoadmaps);
        setUsernames(Object.fromEntries(ownerProfiles));
      } catch (error) {
        console.error("Roadmaps fetch error:", error);
        toast.error("Could not load roadmaps");
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const addStep = async (event: React.FormEvent) => {
    event.preventDefault();
    const url = videoUrl.trim();
    if (!url) return;

    setAddingStep(true);
    try {
      const response = await fetch(`/api/youtube-meta?url=${encodeURIComponent(url)}`);
      const metadata = await response.json() as YoutubeMeta;
      if (!response.ok) throw new Error(metadata.error || "Could not fetch video details");
      if (steps.some((step) => step.youtubeId === metadata.youtubeId)) {
        throw new Error("That video is already in this roadmap");
      }

      setSteps((current) => [...current, {
        id: makeStepId(),
        url,
        youtubeId: metadata.youtubeId,
        title: metadata.title,
        thumbnail: metadata.thumbnail,
        status: "pending",
      }]);
      setVideoUrl("");
      setShowVideoInput(false);
      toast.success("Video added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add this video");
    } finally {
      setAddingStep(false);
    }
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const changeBuilderStepStatus = (stepId: string, status: RoadmapStepStatus) => {
    setSteps((current) => current.map((step) => step.id === stepId ? { ...step, status } : step));
  };

  const resetBuilder = () => {
    setRoadmapTitle("");
    setVideoUrl("");
    setShowVideoInput(true);
    setSteps([]);
    setEditingRoadmapId(null);
    setEditingVisibility("public");
    setShowBuilder(false);
  };

  const toggleBuilder = () => {
    if (showBuilder) {
      resetBuilder();
      return;
    }
    setRoadmapTitle("");
    setVideoUrl("");
    setShowVideoInput(true);
    setSteps([]);
    setEditingRoadmapId(null);
    setEditingVisibility("public");
    setShowBuilder(true);
  };

  const editRoadmap = (roadmap: Roadmap) => {
    if (!user || roadmap.ownerId !== user.uid) return;
    setEditingRoadmapId(roadmap.id);
    setEditingVisibility(roadmap.visibility);
    setRoadmapTitle(roadmap.title);
    setVideoUrl("");
    setSteps(roadmap.steps.map((step) => ({ ...step })));
    setShowVideoInput(roadmap.steps.length === 0);
    setShowBuilder(true);
    window.requestAnimationFrame(() => {
      document.getElementById("roadmap-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  useEffect(() => {
    if (loading || !user) return;
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId || handledEditId.current === editId) return;
    handledEditId.current = editId;
    const roadmap = roadmaps.find((item) => item.id === editId && item.ownerId === user.uid);
    if (roadmap) {
      editRoadmap(roadmap);
    } else {
      toast.error("Only your own roadmap can be edited.");
      window.history.replaceState({}, "", "/roadmaps");
    }
  }, [loading, roadmaps, user]);

  const saveRoadmap = async () => {
    const cleanTitle = roadmapTitle.trim();
    if (!cleanTitle) {
      toast.error("Enter a roadmap title");
      return;
    }
    if (steps.length === 0) {
      toast.error("Add at least one YouTube video");
      return;
    }
    if (!user) {
      window.location.replace("/");
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      let savedRoadmapId: string;
      if (editingRoadmapId) {
        const roadmapRef = doc(db, "roadmaps", editingRoadmapId);
        await runTransaction(db, async (transaction) => {
          const snapshot = await transaction.get(roadmapRef);
          if (!snapshot.exists()) throw new Error("This roadmap no longer exists.");
          if (snapshot.data().ownerId !== user.uid) throw new Error("Only the roadmap owner can edit it.");
          transaction.update(roadmapRef, {
            title: cleanTitle,
            description: "",
            visibility: editingVisibility,
            steps,
            updatedAt: now,
          });
        });
        savedRoadmapId = editingRoadmapId;
        toast.success("Roadmap updated");
      } else {
        const roadmapDoc = await addDoc(collection(db, "roadmaps"), {
          ownerId: user.uid,
          title: cleanTitle,
          description: "",
          visibility: "public",
          steps,
          createdAt: now,
          updatedAt: now,
        });
        savedRoadmapId = roadmapDoc.id;
        toast.success("Roadmap saved");
      }
      invalidateCache("roadmaps:");
      resetBuilder();
      window.location.assign(`/roadmaps/${encodeURIComponent(savedRoadmapId)}`);
    } catch (error) {
      console.error("Roadmap save error:", error);
      toast.error(error instanceof Error ? error.message : "Could not save roadmap. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return <BrandLoader label="Loading roadmaps…" />;
  }

  if (!user) return null;

  const ownRoadmaps = roadmaps.filter((roadmap) => roadmap.ownerId === user.uid);
  const communityRoadmaps = roadmaps.filter(
    (roadmap) => roadmap.ownerId !== user.uid && roadmap.visibility === "public",
  );

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Map className="h-5 w-5" />
            <span className="text-xs font-bold uppercase tracking-widest">Learn in order</span>
          </div>
          <h1 className="text-3xl font-bold sm:text-4xl">Mind <span className="text-primary">Roadmaps</span></h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            See every learning path at a glance, track completion, then open one to follow its videos in order.
          </p>
        </div>
        <Button type="button" size="lg" onClick={toggleBuilder} aria-expanded={showBuilder}>
          {showBuilder ? <X /> : <Plus />}
          {showBuilder ? "Close Builder" : "Add Roadmap"}
        </Button>
      </header>

      {showBuilder && (
        <section id="roadmap-builder" className="animate-fade-in scroll-mt-24 rounded-lg border border-border bg-secondary p-3 sm:p-6" aria-labelledby="builder-title">
          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-wide text-primary">
              {editingRoadmapId ? "Editing your roadmap" : "New roadmap"}
            </p>
            <h2 id="builder-title" className="mt-1 text-2xl font-bold">
              {editingRoadmapId ? "Edit videos and progress" : "Build your learning path"}
            </h2>
          </div>

          <div className="mx-auto max-w-3xl rounded-lg border border-border bg-white p-4 sm:p-5">
            <div className="mb-5 space-y-1.5 border-b border-border pb-5">
              <label htmlFor="roadmap-title" className="text-sm font-semibold">
                Roadmap title <span className="text-primary">*</span>
              </label>
              <Input
                id="roadmap-title"
                value={roadmapTitle}
                onChange={(event) => setRoadmapTitle(event.target.value)}
                placeholder="e.g. Learn React from scratch"
                maxLength={100}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                This is your roadmap name. YouTube titles are fetched separately for each video.
              </p>
            </div>

            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold">Roadmap videos</h3>
                <p className="text-xs text-muted-foreground">Add YouTube videos in the order they should be watched.</p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold">
                {steps.length} video{steps.length === 1 ? "" : "s"}
              </span>
            </div>

            {steps.length > 0 && (
              <RoadmapStepList
                steps={steps}
                editable
                statusEditable
                onMove={moveStep}
                onRemove={removeStep}
                onStatusChange={changeBuilderStepStatus}
              />
            )}

            {showVideoInput ? (
              <form onSubmit={addStep} className={`${steps.length > 0 ? "mt-4" : ""} rounded-lg border border-border bg-secondary p-3 sm:p-4`}>
                <label htmlFor="roadmap-video-url" className="mb-2 block text-sm font-semibold">
                  Video {steps.length + 1} YouTube URL
                </label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="roadmap-video-url"
                    type="url"
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="bg-white pl-9"
                    disabled={addingStep}
                    autoFocus
                    required
                  />
                </div>
                <Button type="submit" variant="outline" className="mt-2 w-full bg-white" disabled={addingStep || !videoUrl.trim()}>
                  {addingStep ? <Loader2 className="animate-spin" /> : <Plus />}
                  {addingStep ? "Fetching video…" : `Add Video ${steps.length + 1}`}
                </Button>
              </form>
            ) : (
              <Button type="button" variant="outline" className="mt-4 w-full bg-transparent" onClick={() => setShowVideoInput(true)}>
                <Plus /> Add Video {steps.length + 1}
              </Button>
            )}

            <Button type="button" size="lg" className="mt-5 w-full" onClick={saveRoadmap} disabled={saving || !roadmapTitle.trim() || steps.length === 0}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saving
                ? (editingRoadmapId ? "Updating roadmap…" : "Saving roadmap…")
                : (editingRoadmapId ? "Update Roadmap" : "Save Roadmap")}
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="your-roadmaps-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="your-roadmaps-title" className="text-2xl font-bold">Your roadmaps</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open a card to see its full path and update progress.</p>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">{ownRoadmaps.length}</span>
        </div>
        {ownRoadmaps.length > 0 ? (
          <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {ownRoadmaps.map((roadmap) => (
              <RoadmapSummaryCard key={roadmap.id} roadmap={roadmap} ownerName={usernames[roadmap.ownerId] || "you"} isOwner />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Map className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h3 className="font-bold">No roadmaps yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Create your first ordered learning path.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="community-roadmaps-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="community-roadmaps-title" className="text-2xl font-bold">Connections’ roadmaps</h2>
            <p className="mt-1 text-sm text-muted-foreground">Open a shared path to view its progress or make your own copy.</p>
          </div>
          <span className="text-sm font-semibold text-muted-foreground">{communityRoadmaps.length}</span>
        </div>
        {communityRoadmaps.length > 0 ? (
          <div className="grid items-stretch gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {communityRoadmaps.map((roadmap) => (
              <RoadmapSummaryCard key={roadmap.id} roadmap={roadmap} ownerName={usernames[roadmap.ownerId] || "unknown"} isOwner={false} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Globe2 className="mx-auto mb-3 h-8 w-8 text-primary" />
            <h3 className="font-bold">No connected roadmaps yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">Accept a connection to see the roadmaps they share.</p>
          </div>
        )}
      </section>
    </div>
  );
}
