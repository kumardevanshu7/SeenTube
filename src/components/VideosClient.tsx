import { useState, useEffect } from "react";
import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import VideoGrid from "./VideoGrid";
import type { VideoCardData } from "./VideoCard";
import { getCached, setCached } from "@/lib/data-cache";
import { getUserProfile } from "@/lib/users";
import BrandLoader from "./BrandLoader";

const cacheKey = (uid: string) => `videos:list:${uid}`;

export default function VideosClient() {
  const [user, setUser] = useState<any>(null);
  const [videos, setVideos] = useState<VideoCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        window.location.href = "/";
        return;
      }

      const profile = await getUserProfile(u.uid);
      if (!profile?.username) {
        window.location.href = "/onboarding";
        return;
      }
      setUser(u);

      const entry = getCached<VideoCardData[]>(cacheKey(u.uid));
      if (entry) {
        setVideos(entry.data);
        setLoading(false);
      }
      if (!entry?.isFresh) await fetchData(u.uid);
    });
    return () => unsubscribe();
  }, []);

  const fetchData = async (uid: string) => {
    try {
      // Personal collection contains only videos owned by this account.
      const vq = query(collection(db, "videos"), where("addedBy", "==", uid));
      const vSnap = await getDocs(vq);
      const vList = vSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as any)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      // Only this user's statuses are needed for their personal copies.
      const sq = query(collection(db, "videoStatuses"), where("userId", "==", uid));
      const sSnap = await getDocs(sq);
      const sList = sSnap.docs.map((d) => ({ id: d.id, ...d.data() }) as any);
      const friend: any = null;

      const enrichedVideos: VideoCardData[] = vList.map((v: any) => {
        const myStatusRow = sList.find(
          (s: any) => s.videoId === v.id && s.userId === uid
        );
        const friendStatusRow = friend
          ? sList.find((s: any) => s.videoId === v.id && s.userId === friend.id)
          : null;

        return {
          id: v.id,
          videoId: v.videoId ?? "",
          title: v.title ?? "Untitled",
          thumbnail: v.thumbnail ?? "",
          category: v.category ?? "Other",
          tags: v.tags ?? [],
          description: v.description ?? "",
          createdAt: v.createdAt ?? 0,
          addedBy: v.addedBy ?? "",
          myStatus: myStatusRow?.status ?? "pending",
          friendStatus: friendStatusRow?.status ?? null,
          friendName: friend?.name ?? null,
          friendAvatar: friend?.image ?? null,
          friendId: friend?.id ?? null,
          myStatusDocId: myStatusRow?.id ?? null,
        };
      });

      setVideos(enrichedVideos);
      setCached(cacheKey(uid), enrichedVideos);
    } catch (err) {
      console.error("Error fetching videos:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <BrandLoader label="Loading your collection…" />;
  }

  if (!user) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="animate-fade-in flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">
            Video <span className="gradient-text">Collection</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            {videos.length} video{videos.length !== 1 ? "s" : ""} in your shared library
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

      <VideoGrid
        initialVideos={videos}
        currentUserId={user.uid}
      />
    </div>
  );
}
