"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Search, SlidersHorizontal, X, Rows3, Grid2x2 } from "lucide-react";
import { cn } from "@/lib/utils";
import VideoCard, { type VideoCardData } from "./VideoCard";
import EditCategoriesDialog from "./EditCategoriesDialog";
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

interface VideoGridProps {
  initialVideos: VideoCardData[];
  currentUserId: string;
}

type SortOption = "newest" | "oldest" | "title" | "status";

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
  // Mobile-only column toggle: 1 or 2 columns. Persisted so the choice sticks.
  const [mobileCols, setMobileCols] = useState<1 | 2>(2);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);
  const [editCategoriesOpen, setEditCategoriesOpen] = useState(false);

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    const saved = localStorage.getItem("videoGrid:mobileCols");
    if (saved === "1" || saved === "2") setMobileCols(Number(saved) as 1 | 2);
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

  const handleStatusChange = useCallback(
    (videoId: string, newStatus: VideoStatusEnum) => {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, myStatus: newStatus } : v
        )
      );
    },
    []
  );

  const handleDelete = useCallback((videoId: string) => {
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
  }, []);

  // Filtered and sorted videos
  const filtered = videos
    .filter((v) => {
      const q = search.toLowerCase();
      if (
        q &&
        !v.title.toLowerCase().includes(q) &&
        !v.tags.some((t) => t.toLowerCase().includes(q)) &&
        !v.category.toLowerCase().includes(q) &&
        !v.description.toLowerCase().includes(q)
      )
        return false;
      if (categoryFilter !== "all" && v.category !== categoryFilter)
        return false;
      if (statusFilter !== "all" && v.myStatus !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sort) {
        case "newest":
          return b.createdAt - a.createdAt;
        case "oldest":
          return a.createdAt - b.createdAt;
        case "title":
          return a.title.localeCompare(b.title);
        case "status":
          return a.myStatus.localeCompare(b.myStatus);
        default:
          return 0;
      }
    });

  const hasFilters =
    search || categoryFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="space-y-6">
      {/* Search & Filter Bar */}
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

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partially_watched">
                      Partially Watched
                    </SelectItem>
                    <SelectItem value="watched">Watched</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sort}
                  onValueChange={(v) => setSort(v as SortOption)}
                >
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="text-muted-foreground"
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === videos.length
            ? `${videos.length} videos`
            : `${filtered.length} of ${videos.length} videos`}
        </p>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
          {/* Mobile-only 1/2 column toggle */}
          <button
            onClick={toggleMobileCols}
            className="sm:hidden flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title={mobileCols === 2 ? "Switch to 1 column" : "Switch to 2 columns"}
            aria-label="Toggle grid columns"
          >
            {mobileCols === 2 ? (
              <Rows3 className="h-4 w-4" />
            ) : (
              <Grid2x2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Video Grid */}
      {filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-20"
        >
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display text-lg font-semibold mb-2">
            No videos found
          </h3>
          <p className="text-muted-foreground text-sm">
            {search
              ? `No results for "${search}"`
              : "Try adjusting your filters"}
          </p>
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={clearFilters}
            >
              Clear all filters
            </Button>
          )}
        </motion.div>
      ) : (
        <motion.div
          layout
          className={cn(
            "grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
            mobileCols === 1 ? "grid-cols-1" : "grid-cols-2"
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
                compact={mobileCols === 2}
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
    </div>
  );
}
