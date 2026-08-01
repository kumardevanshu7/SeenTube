import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, getDocs, where } from "firebase/firestore";
import DashboardStats from "./DashboardStats";
import { formatRelativeDate } from "@/lib/utils";
import type { Video, VideoStatus } from "@/lib/constants";
import { getCached, setCached } from "@/lib/data-cache";
import { redirectNeedsUsername, redirectSignedOut, watchAuth } from "@/lib/auth";

const cacheKey = (uid: string) => `dashboard:data:${uid}`;

interface DashboardCache {
  videos: Video[];
  statuses: VideoStatus[];
  friend: any;
}

export default function DashboardClient() {
  const [user, setUser] = useState<any>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [statuses, setStatuses] = useState<VideoStatus[]>([]);
  const [friend, setFriend] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const recentVideos = videos.slice(0, 5).map((v) => {
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

      {recentVideos.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl font-bold">Recently Added</h2>
            <a href="/videos" className="text-sm text-primary hover:underline flex items-center gap-1">
              View all
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div className="space-y-3">
            {recentVideos.map((v: any, i) => (
              <div
                key={v.id}
                className="card rounded-lg p-4 flex items-center gap-4 animate-fade-in"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="relative flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden bg-muted">
                  <img
                    src={v.thumbnail}
                    alt={v.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      // fallback to hqdefault if maxresdefault 404s
                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{v.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">{v.category}</span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelativeDate(
                        typeof v.createdAt === "number"
                          ? v.createdAt
                          : new Date(v.createdAt ?? 0).getTime()
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                    v.myStatus === "watched" ? "badge-watched" :
                    v.myStatus === "partially_watched" ? "badge-partially" :
                    "badge-pending"
                  }`}>
                    {v.myStatus === "watched" ? "Watched" :
                     v.myStatus === "partially_watched" ? "Partial" :
                     "Pending"}
                  </span>
                </div>
              </div>
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
