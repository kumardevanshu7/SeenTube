import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import {
  Library,
  Map,
  Plus,
  UsersRound,
  Youtube,
} from "lucide-react";
import DashboardStats from "./DashboardStats";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { Video, VideoStatus, VideoStatusEnum } from "@/lib/constants";
import { getCached, setCached } from "@/lib/data-cache";
import { redirectNeedsUsername, redirectSignedOut, watchAuth } from "@/lib/auth";

const cacheKey = (uid: string) => `dashboard:data:${uid}`;
const GRID_COLS = [3, 4, 5, 6, 7] as const;
type GridCols = (typeof GRID_COLS)[number];

const gridColClass: Record<GridCols, string> = {
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6",
  7: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7",
};

interface DashboardCache {
  videos: Video[];
  statuses: VideoStatus[];
  friend: any;
}

const quickTasks = [
  {
    href: "/videos/add",
    label: "Add Video",
    hint: "Paste a YouTube link",
    icon: Plus,
    external: false,
  },
  {
    href: "/videos",
    label: "Collection",
    hint: "Browse your library",
    icon: Library,
    external: false,
  },
  {
    href: "https://www.youtube.com",
    label: "YouTube",
    hint: "Open YouTube",
    icon: Youtube,
    external: true,
  },
  {
    href: "/guild",
    label: "Guild",
    hint: "Connections & shares",
    icon: UsersRound,
    external: false,
  },
  {
    href: "/roadmaps",
    label: "Roadmaps",
    hint: "Learning paths",
    icon: Map,
    external: false,
  },
] as const;

const statusLabel = (status: VideoStatusEnum | "pending") => {
  if (status === "watched") return "Watched";
  if (status === "partially_watched") return "Partial";
  return "Pending";
};

const statusClass = (status: VideoStatusEnum | "pending") => {
  if (status === "watched") return "badge-watched";
  if (status === "partially_watched") return "badge-partially";
  return "badge-pending";
};

export default function DashboardClient() {
  const [user, setUser] = useState<any>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [statuses, setStatuses] = useState<VideoStatus[]>([]);
  const [friend, setFriend] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gridCols, setGridCols] = useState<GridCols>(4);

  useEffect(() => {
    const saved = Number(localStorage.getItem("dashboard:gridCols"));
    if (GRID_COLS.includes(saved as GridCols)) setGridCols(saved as GridCols);
  }, []);

  const changeGridCols = (cols: GridCols) => {
    setGridCols(cols);
    localStorage.setItem("dashboard:gridCols", String(cols));
  };

  useEffect(() => {
    return watchAuth({
      onSignedOut: () => redirectSignedOut("/"),
      onNeedsUsername: () => redirectNeedsUsername(),
      onReady: async (u) => {
        setUser(u);

        const entry = getCached<DashboardCache>(cacheKey(u.uid));
        if (entry) {
          setVideos(entry.data.videos);
          setStatuses(entry.data.statuses);
          setFriend(entry.data.friend);
          setLoading(false);
        }
        if (!entry?.isFresh) await fetchData(u.uid);
      },
    });
  }, []);

  const fetchData = async (uid: string) => {
    try {
      // Dashboard stats are scoped to the signed-in account's collection.
      const vq = query(collection(db, "videos"), where("addedBy", "==", uid));
      const vSnap = await getDocs(vq);
      const vList = vSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as Video))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      const sq = query(collection(db, "videoStatuses"), where("userId", "==", uid));
      const sSnap = await getDocs(sq);
      const sList = sSnap.docs.map((d) => ({ id: d.id, ...d.data() } as VideoStatus));
      const f = null;

      setVideos(vList);
      setStatuses(sList);
      setFriend(f);
      setCached(cacheKey(uid), { videos: vList, statuses: sList, friend: f });
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="space-y-2">
            <div className="h-9 w-72 rounded-md animate-shimmer" />
            <div className="h-4 w-48 rounded-md animate-shimmer" />
          </div>
          <div className="h-12 w-32 rounded-lg animate-shimmer" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg animate-shimmer" />
              <div className="h-8 w-12 rounded-md animate-shimmer" />
              <div className="h-4 w-20 rounded-md animate-shimmer" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-6 w-36 rounded-md animate-shimmer" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border p-4 flex items-center gap-4">
              <div className="w-20 h-14 rounded-lg animate-shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-3/4 rounded-md animate-shimmer" />
                <div className="h-3 w-1/3 rounded-md animate-shimmer" />
              </div>
              <div className="h-6 w-20 rounded-full animate-shimmer shrink-0" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  const myStatuses = statuses.filter((s) => s.userId === user.uid);
  const total = videos.length;
  const watched = myStatuses.filter((s) => s.status === "watched").length;
  const partiallyWatched = myStatuses.filter((s) => s.status === "partially_watched").length;
  const pending = total - watched - partiallyWatched;

  const recentVideos = videos.slice(0, Math.max(gridCols * 2, 8)).map((v) => {
    const myStatus = myStatuses.find((s) => s.videoId === v.id)?.status ?? "pending";
    const friendStatus = friend
      ? statuses.find((s) => s.videoId === v.id && s.userId === friend.id)?.status
      : null;
    return { ...v, myStatus, friendStatus };
  });

  const stats = { total, pending, partiallyWatched, watched };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-10">
      <div className="animate-fade-in">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              Welcome back, <span className="gradient-text">{user.displayName?.split(" ")[0]}</span> 👋
            </h1>
            <p className="text-muted-foreground mt-1">
              {friend ? `Watching with ${friend.name?.split(" ")[0]}` : "Your shared collection"}
            </p>
          </div>
          <a
            href="/videos/add"
            className="flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-[#e00b41] active:bg-[#e00b41]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 5v14M5 12h14" />
            </svg>
            Add Video
          </a>
        </div>
      </div>

      <DashboardStats stats={stats} />

      <section className="space-y-3" aria-labelledby="quick-tasks-title">
        <h2 id="quick-tasks-title" className="font-display text-xl font-bold">Quick tasks</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {quickTasks.map((task) => {
            const Icon = task.icon;
            return (
              <a
                key={task.label}
                href={task.href}
                {...(task.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="card flex items-center gap-3 rounded-lg border border-border p-3.5 transition-colors hover:border-primary/40 hover:bg-secondary/60"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#fff0f3] text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{task.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{task.hint}</span>
                </span>
              </a>
            );
          })}
        </div>
      </section>

      {recentVideos.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="font-display text-xl font-bold">Recently Added</h2>
              <p className="mt-1 text-sm text-muted-foreground">Square video cards from your collection</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-border p-1" role="group" aria-label="Dashboard grid columns">
                {GRID_COLS.map((cols) => (
                  <button
                    key={cols}
                    type="button"
                    onClick={() => changeGridCols(cols)}
                    className={cn(
                      "h-8 min-w-8 rounded-md px-2 text-xs font-semibold transition-colors",
                      gridCols === cols
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                    aria-pressed={gridCols === cols}
                  >
                    {cols}
                  </button>
                ))}
              </div>
              <a href="/videos" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                </svg>
              </a>
            </div>
          </div>

          <div className={cn("grid gap-3 sm:gap-4", gridColClass[gridCols])}>
            {recentVideos.map((v: any, i) => (
              <a
                key={v.id}
                href={`https://www.youtube.com/watch?v=${encodeURIComponent(v.videoId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="card group relative aspect-square overflow-hidden rounded-lg border border-border animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` }}
                aria-label={`Watch ${v.title} on YouTube`}
              >
                <img
                  src={v.thumbnail}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="lazy"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 space-y-1.5 p-2.5 sm:p-3">
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold sm:text-xs", statusClass(v.myStatus))}>
                    {statusLabel(v.myStatus)}
                  </span>
                  <p className="line-clamp-2 text-xs font-semibold leading-snug text-white sm:text-sm">
                    {v.title}
                  </p>
                  <p className="truncate text-[10px] text-white/70 sm:text-xs">
                    {v.category}
                    <span className="mx-1 opacity-50">·</span>
                    {formatRelativeDate(
                      typeof v.createdAt === "number"
                        ? v.createdAt
                        : new Date(v.createdAt ?? 0).getTime(),
                    )}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {total === 0 && (
        <div className="text-center py-20 animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-secondary border border-border flex items-center justify-center mx-auto mb-6">
            <svg className="w-12 h-12 text-primary" fill="currentColor" viewBox="0 0 24 24">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          </div>
          <h2 className="font-display text-2xl font-bold mb-3">No videos yet</h2>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            Start building your shared collection by adding the first YouTube video.
          </p>
          <a
            href="/videos/add"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-[#e00b41] active:scale-95 transition-all"
          >
            Add your first video
          </a>
        </div>
      )}
    </div>
  );
}
