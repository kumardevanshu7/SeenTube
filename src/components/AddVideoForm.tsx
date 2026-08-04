"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Link2,
  Loader2,
  Tag,
  FileText,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Youtube,
  Pencil,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { cn, extractYouTubeId } from "@/lib/utils";
import { CATEGORIES } from "@/lib/constants";
import { getUserCategoryPrefs, resolveCategories } from "@/lib/categories";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import { invalidateCache } from "@/lib/data-cache";
import { redirectNeedsUsername, redirectSignedOut, watchAuth } from "@/lib/auth";
import EditCategoriesDialog from "./EditCategoriesDialog";

interface YoutubeMeta {
  title: string;
  thumbnail: string;
  youtubeId: string;
}

async function videoAlreadyAddedByUser(youtubeId: string, userId: string) {
  const duplicateQuery = query(
    collection(db, "videos"),
    where("addedBy", "==", userId),
    where("videoId", "==", youtubeId),
  );
  const snapshot = await getDocs(duplicateQuery);
  return !snapshot.empty;
}

export default function AddVideoForm() {
  const [url, setUrl] = useState("");
  const [meta, setMeta] = useState<YoutubeMeta | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [duplicateError, setDuplicateError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [tag1, setTag1] = useState("");
  const [tag2, setTag2] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false);
  const [savedTags, setSavedTags] = useState<string[]>([]);

  // Auth check
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    return watchAuth({
      onSignedOut: () => redirectSignedOut("/"),
      onNeedsUsername: () => redirectNeedsUsername(),
      onReady: async (u) => {
        try {
          const prefs = await getUserCategoryPrefs(u.uid);
          setCategories(resolveCategories(prefs));
        } catch {
          setCategories([...CATEGORIES]);
        }

        try {
          const snapshot = await getDocs(query(
            collection(db, "videos"),
            where("addedBy", "==", u.uid),
          ));
          const seen = new Map<string, string>();
          snapshot.docs.forEach((videoDoc) => {
            const tags = videoDoc.data().tags;
            if (!Array.isArray(tags)) return;
            tags.forEach((tag) => {
              if (typeof tag !== "string") return;
              const cleaned = tag.trim().replace(/\s+/g, " ");
              if (!cleaned) return;
              const key = cleaned.toLowerCase();
              if (!seen.has(key)) seen.set(key, cleaned);
            });
          });
          setSavedTags(
            Array.from(seen.values()).sort((a, b) => a.localeCompare(b)),
          );
        } catch {
          setSavedTags([]);
        }

        setAuthChecked(true);
      },
    });
  }, []);

  const selectedTags = [tag1, tag2]
    .map((tag) => tag.trim())
    .filter(Boolean);

  const toggleSavedTag = (tag: string) => {
    const key = tag.toLowerCase();
    const inSlot1 = tag1.trim().toLowerCase() === key;
    const inSlot2 = tag2.trim().toLowerCase() === key;

    if (inSlot1) {
      setTag1(tag2);
      setTag2("");
      return;
    }
    if (inSlot2) {
      setTag2("");
      return;
    }
    if (!tag1.trim()) {
      setTag1(tag);
      return;
    }
    if (!tag2.trim()) {
      setTag2(tag);
      return;
    }
    // Both slots full — replace the second tag.
    setTag2(tag);
  };
  // Auto-fetch metadata and check whether this account already added the video.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFetchError("");
    setDuplicateError("");
    setSubmitError("");

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      if (url && url.length > 10) {
        setFetchError("Please enter a valid YouTube URL");
      }
      setMeta(null);
      return;
    }

    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      setIsFetching(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error("Please sign in again.");
        const token = await currentUser.getIdToken();
        const res = await fetch(
          `/api/youtube-meta?url=${encodeURIComponent(url)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data: YoutubeMeta & { error?: string } = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to fetch");

        const isDuplicate = await videoAlreadyAddedByUser(data.youtubeId, currentUser.uid);

        if (cancelled) return;
        setMeta(data);
        setFetchError("");
        setDuplicateError(
          isDuplicate
            ? "This video is already in your collection. Paste a different YouTube link."
            : ""
        );
      } catch (err: any) {
        if (cancelled) return;
        setFetchError(err.message ?? "Could not fetch video info");
        setMeta(null);
      } finally {
        if (!cancelled) setIsFetching(false);
      }
    }, 600);

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [url, authChecked]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta || !category || duplicateError) return;

    setIsSubmitting(true);
    setSubmitError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be logged in to add a video");

      // Always re-check at submit time. This protects against stale UI and
      // catches videos created in another tab after the URL preview loaded.
      const isDuplicate = await videoAlreadyAddedByUser(meta.youtubeId, user.uid);
      if (isDuplicate) {
        setDuplicateError(
          "This video is already in your collection. Paste a different YouTube link."
        );
        return;
      }

      // Deterministic IDs make duplicate writes idempotent even if two submit
      // requests happen nearly at the same time. Different users can still add
      // the same YouTube video because their UID is part of the document ID.
      const videoDocId = `${user.uid}_${meta.youtubeId}`;
      const statusDocId = `${videoDocId}_${user.uid}`;
      const now = Date.now();

      const batch = writeBatch(db);
      batch.set(doc(db, "videos", videoDocId), {
        videoId: meta.youtubeId,
        title: meta.title,
        thumbnail: meta.thumbnail,
        category,
        tags: [tag1, tag2].filter(Boolean),
        description,
        addedBy: user.uid,
        visibility: "public",
        createdAt: now,
      });

      batch.set(doc(db, "videoStatuses", statusDocId), {
        videoId: videoDocId,
        userId: user.uid,
        status: "pending",
        progress: 0,
        updatedAt: now,
      });
      await batch.commit();

      invalidateCache("videos:");
      invalidateCache("dashboard:");
      setIsSuccess(true);

      setTimeout(() => {
        window.location.href = "/videos";
      }, 900);
    } catch (err: any) {
      setSubmitError(err.message ?? "Failed to add video. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="card rounded-lg overflow-hidden"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-start gap-3 p-4 sm:p-5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">
              Added successfully
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold text-foreground">
              Video saved to your collection
            </h2>
            {meta && (
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {meta.title}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Opening your collection…
            </p>
          </div>
        </div>
        <div className="h-1 bg-secondary">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.85, ease: "linear" }}
          />
        </div>
      </motion.div>
    );
  }

  if (!authChecked) {
    return <div className="p-10 text-center animate-pulse text-muted-foreground">Checking authentication...</div>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Step 1: URL */}
      <div className="card rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
            1
          </div>
          <div>
            <h3 className="font-display font-semibold">YouTube URL</h3>
            <p className="text-xs text-muted-foreground">
              Paste any YouTube link to auto-fetch details
            </p>
          </div>
        </div>

        <div className="relative">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="pl-9 pr-10"
            required
          />
          {isFetching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary animate-spin" />
          )}
          {meta && !isFetching && !duplicateError && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground" />
          )}
          {duplicateError && !isFetching && (
            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />
          )}
        </div>

        {fetchError && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {fetchError}
          </p>
        )}

        {duplicateError && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Already added</p>
              <p className="mt-0.5 text-xs leading-relaxed opacity-80">
                {duplicateError}
              </p>
            </div>
          </div>
        )}

        {/* Preview */}
        <AnimatePresence>
          {meta && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div
                className={cn(
                  "rounded-lg border overflow-hidden",
                  duplicateError
                    ? "border-destructive/20 bg-destructive/5"
                    : "border-border bg-secondary"
                )}
              >
                <div className="flex gap-3 p-3">
                  <div className="relative flex-shrink-0">
                    <img
                      src={meta.thumbnail}
                      alt={meta.title}
                      className="w-28 h-[4.5rem] sm:w-32 sm:h-20 object-cover rounded-md"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-red-600/90 flex items-center justify-center">
                        <Youtube className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 self-center">
                    <p
                      className={cn(
                        "text-xs font-medium mb-1",
                        duplicateError ? "text-destructive" : "text-foreground"
                      )}
                    >
                      {duplicateError ? "Already in collection" : "Video found"}
                    </p>
                    <p className="text-sm font-semibold text-foreground line-clamp-2">
                      {meta.title}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Step 2: Details (shown only for a new video) */}
      <AnimatePresence>
        {meta && !duplicateError && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card rounded-lg p-6 space-y-5"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-bold text-sm">
                2
              </div>
              <div>
                <h3 className="font-display font-semibold">Video Details</h3>
                <p className="text-xs text-muted-foreground">
                  Add tags, category and description
                </p>
              </div>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Category <span className="text-destructive">*</span>
              </label>
              <Select
                value={category}
                onValueChange={(value) => {
                  if (value === "__edit__") {
                    setEditCategoriesOpen(true);
                    return;
                  }
                  setCategory(value);
                }}
                required
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                  <SelectItem value="__edit__" className="text-primary focus:text-primary">
                    <span className="inline-flex items-center gap-2">
                      <Pencil className="h-3.5 w-3.5" />
                      Edit categories
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Tags{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (up to 2)
                </span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="e.g. React"
                    value={tag1}
                    onChange={(e) => setTag1(e.target.value)}
                    className="pl-8"
                    maxLength={30}
                  />
                </div>
                <div className="relative">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="e.g. Hooks"
                    value={tag2}
                    onChange={(e) => setTag2(e.target.value)}
                    className="pl-8"
                    maxLength={30}
                  />
                </div>
              </div>

              {savedTags.length > 0 && (
                <div className="pt-1">
                  <p className="mb-2 text-xs text-muted-foreground">
                    Your tags — tap to fill
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {savedTags.map((tag) => {
                      const active = selectedTags.some(
                        (selected) => selected.toLowerCase() === tag.toLowerCase(),
                      );
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleSavedTag(tag)}
                          aria-pressed={active}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-secondary text-foreground hover:border-primary/40",
                          )}
                        >
                          <Tag className="h-3 w-3" />
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Description{" "}
                <span className="text-xs text-muted-foreground font-normal">
                  (optional)
                </span>
              </label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                <textarea
                  placeholder="What's this video about? Why is it worth watching?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={300}
                  className={cn(
                    "flex w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-sm ring-offset-background",
                    "pl-9 resize-none",
                    "placeholder:text-muted-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "transition-colors duration-200"
                  )}
                />
                <span className="absolute right-3 bottom-2 text-xs text-muted-foreground">
                  {description.length}/300
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <AnimatePresence>
        {meta && category && !duplicateError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {submitError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding to collection…
                </>
              ) : (
                <>
                  Add to Collection
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <EditCategoriesDialog
        open={editCategoriesOpen}
        onOpenChange={setEditCategoriesOpen}
        onSaved={(next) => {
          setCategories(next);
          if (category && !next.includes(category)) setCategory("");
        }}
      />
    </form>
  );
}
