"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare,
  Pencil,
  Search,
  SlidersHorizontal,
  Trash2,
  X,
  Rows3,
  Grid2x2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import VideoCard, { type VideoCardData } from "./VideoCard";
import EditCategoriesDialog from "./EditCategoriesDialog";
import DeletePasswordDialog from "./DeletePasswordDialog";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { CATEGORIES, type VideoStatusEnum } from "@/lib/constants";
import { getUserCategoryPrefs, resolveCategories } from "@/lib/categories";
import { deleteProtectedResources } from "@/lib/delete-resource";
import { invalidateCache } from "@/lib/data-cache";

interface VideoGridProps {
  initialVideos: VideoCardData[];
  currentUserId: string;
}

type SortOption = "newest" | "oldest" | "title" | "status";
type DesktopCols = 3 | 4 | 5 | 6 | 7;

const DESKTOP_COL_OPTIONS: DesktopCols[] = [3, 4, 5, 6, 7];

const desktopColClass: Record<DesktopCols, string> = {
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
  7: "lg:grid-cols-7",
};

export default function VideoGrid({
  initialVideos,
  currentUserId,
}: VideoGridProps) {
  const [videos, setVideos] = useState<VideoCardData[]>(initialVideos);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortOption>("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [mobileCols, setMobileCols] = useState<1 | 2>(2);
  const [desktopCols, setDesktopCols] = useState<DesktopCols>(4);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    const savedMobile = localStorage.getItem("videoGrid:mobileCols");
    if (savedMobile === "1" || savedMobile === "2") setMobileCols(Number(savedMobile) as 1 | 2);
    const savedDesktop = Number(localStorage.getItem("videoGrid:desktopCols"));
    if (DESKTOP_COL_OPTIONS.includes(savedDesktop as DesktopCols)) {
      setDesktopCols(savedDesktop as DesktopCols);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const prefs = await getUserCategoryPrefs(currentUserId);
        if (!active) return;
        setCategories(resolveCategories(prefs));
      } catch {
        if (active) setCategories([...CATEGORIES]);
      }
    })();
    return () => {
      active = false;
    };
  }, [currentUserId]);

  const toggleMobileCols = () => {
    const next = mobileCols === 1 ? 2 : 1;
    setMobileCols(next);
    localStorage.setItem("videoGrid:mobileCols", String(next));
  };

  const changeDesktopCols = (cols: DesktopCols) => {
    setDesktopCols(cols);
    localStorage.setItem("videoGrid:desktopCols", String(cols));
  };

  const handleStatusChange = useCallback(
    (videoId: string, newStatus: VideoStatusEnum) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, myStatus: newStatus } : v)),
      );
    },
    [],
  );

  const handleDelete = useCallback((videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    setSelectedIds((prev) => {
      if (!prev.has(videoId)) return prev;
      const next = new Set(prev);
      next.delete(videoId);
      return next;
    });
  }, []);

  const filtered = useMemo(() => videos
    .filter((v) => {
      const q = search.toLowerCase();
      if (
        q
        && !v.title.toLowerCase().includes(q)
        && !v.tags.some((t) => t.toLowerCase().includes(q))
        && !v.category.toLowerCase().includes(q)
        && !v.description.toLowerCase().includes(q)
      ) return false;
      if (categoryFilter !== "all" && v.category !== categoryFilter) return false;
      if (statusFilter !== "all" && v.myStatus !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "newest": return b.createdAt - a.createdAt;
        case "oldest": return a.createdAt - b.createdAt;
        case "title": return a.title.localeCompare(b.title);
        case "status": return a.myStatus.localeCompare(b.myStatus);
        default: return 0;
      }
    }), [videos, search, categoryFilter, statusFilter, sort]);

  const selectableFiltered = useMemo(
    () => filtered.filter((video) => video.addedBy === currentUserId),
    [filtered, currentUserId],
  );

  const hasFilters = search || categoryFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (videoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(selectableFiltered.map((video) => video.id)));
  };

  const handleBulkDelete = async (answer: string) => {
    const ids = [...selectedIds];
    if (ids.length === 0) throw new Error("Select at least one video.");
    const deletedIds = await deleteProtectedResources("video", ids, answer);
    setVideos((prev) => prev.filter((video) => !deletedIds.includes(video.id)));
    invalidateCache("videos:");
    invalidateCache("dashboard:");
    toast.success(
      deletedIds.length === 1
        ? "Video removed from collection"
        : `${deletedIds.length} videos removed from collection`,
    );
    exitSelectionMode();
  };

  const selectedCount = selectedIds.size;
  const allFilteredSelected = selectableFiltered.length > 0
    && selectableFiltered.every((video) => selectedIds.has(video.id));

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 rounded-full border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_3px_10px_rgba(0,0,0,0.08)]">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
            <Input
              placeholder="Search by title, tag or category"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-14 rounded-full border-0 bg-transparent pl-12 pr-12 focus-visible:ring-0"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button
            variant={showFilters ? "default" : "outline"}
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className="h-12 w-12 shrink-0 rounded-full"
            title="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="flex flex-wrap gap-3 pt-1">
                <Select
                  value={categoryFilter}
                  onValueChange={(value) => {
                    if (value === "__edit__") {
                      setEditCategoriesOpen(true);
                      return;
                    }
                    setCategoryFilter(value);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                    <SelectItem value="__edit__" className="text-primary focus:text-primary">
                      <span className="inline-flex items-center gap-2">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit categories
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partially_watched">Partially Watched</SelectItem>
                    <SelectItem value="watched">Watched</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="title">Title A-Z</SelectItem>
                    <SelectItem value="status">By Status</SelectItem>
                  </SelectContent>
                </Select>

                {hasFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === videos.length
            ? `${videos.length} videos`
            : `${filtered.length} of ${videos.length} videos`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {!selectionMode ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              disabled={selectableFiltered.length === 0}
            >
              <CheckSquare className="h-4 w-4" />
              Select
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" size="sm" onClick={exitSelectionMode}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={allFilteredSelected ? () => setSelectedIds(new Set()) : selectAllFiltered}
                disabled={selectableFiltered.length === 0}
              >
                {allFilteredSelected ? "Clear selection" : "Select all"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={selectedCount === 0}
                onClick={() => setBulkDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                Delete{selectedCount > 0 ? ` (${selectedCount})` : ""}
              </Button>
            </>
          )}

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-primary hover:underline">
              Clear filters
            </button>
          )}

          <div className="hidden items-center gap-1 rounded-lg border border-border p-1 lg:flex" role="group" aria-label="Grid columns">
            {DESKTOP_COL_OPTIONS.map((cols) => (
              <button
                key={cols}
                type="button"
                onClick={() => changeDesktopCols(cols)}
                className={cn(
                  "h-8 min-w-8 rounded-md px-2 text-xs font-semibold transition-colors",
                  desktopCols === cols
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
                aria-pressed={desktopCols === cols}
              >
                {cols}
              </button>
            ))}
          </div>

          <button
            onClick={toggleMobileCols}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:hidden"
            title={mobileCols === 2 ? "Switch to 1 column" : "Switch to 2 columns"}
            aria-label="Toggle grid columns"
          >
            {mobileCols === 2 ? <Rows3 className="h-4 w-4" /> : <Grid2x2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {selectionMode && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-foreground">
          {selectedCount === 0
            ? "Tap cards to select videos for bulk delete."
            : `${selectedCount} selected — One Password is required to delete.`}
        </div>
      )}

      {filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-20 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Search className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 font-display text-lg font-semibold">No videos found</h3>
          <p className="text-sm text-muted-foreground">
            {search ? `No results for "${search}"` : "Try adjusting your filters"}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
              Clear all filters
            </Button>
          )}
        </motion.div>
      ) : (
        <motion.div
          layout
          className={cn(
            "grid items-stretch gap-4 sm:grid-cols-2",
            desktopColClass[desktopCols],
            mobileCols === 1 ? "grid-cols-1" : "grid-cols-2",
          )}
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((video, i) => (
              <VideoCard
                key={video.id}
                video={video}
                currentUserId={currentUserId}
                index={i}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                compact={mobileCols === 2 || desktopCols >= 5}
                selectionMode={selectionMode}
                selected={selectedIds.has(video.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <EditCategoriesDialog
        open={editCategoriesOpen}
        onOpenChange={setEditCategoriesOpen}
        onSaved={(next) => {
          setCategories(next);
          if (categoryFilter !== "all" && !next.includes(categoryFilter)) {
            setCategoryFilter("all");
          }
        }}
      />

      <DeletePasswordDialog
        open={bulkDeleteOpen}
        resourceName={
          selectedCount === 1
            ? (videos.find((video) => selectedIds.has(video.id))?.title || "1 video")
            : `${selectedCount} videos`
        }
        resourceLabel={selectedCount === 1 ? "video" : "videos"}
        onOpenChange={(open) => {
          setBulkDeleteOpen(open);
        }}
        onConfirm={handleBulkDelete}
      />
    </div>
  );
}
