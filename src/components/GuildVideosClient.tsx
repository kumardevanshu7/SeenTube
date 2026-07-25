import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  collection,
  doc,
  documentId,
  endAt,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  startAt,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  Check,
  ExternalLink,
  Library,
  Loader2,
  Search,
  Send,
  Tag,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { auth, db } from "@/lib/firebase";
import { invalidateCache } from "@/lib/data-cache";
import {
  removeConnection,
  respondToConnectionRequest,
  sendConnectionRequest,
  subscribeToUserConnectionDocuments,
  type Connection,
} from "@/lib/connections";
import { normalizeUsername } from "@/lib/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type MemberProfile = {
  uid: string;
  username: string;
  name: string;
};
type ConnectionView = Connection & {
  id: string;
  other: MemberProfile;
};

type UsernameSuggestion = {
  uid: string;
  username: string;
  name: string;
  image: string | null;
};

type GuildVideo = {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  category: string;
  tags: string[];
  description: string;
  channelTitle?: string;
  duration?: string;
  addedBy: string;
  createdAt: unknown;
  visibility?: string;
  ownerUsername: string;
};

type ImportState = "existing" | "imported";

const timestampValue = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
};

const invalidateConnectionCaches = () => {
  invalidateCache("connections:");
  invalidateCache("guild:");
  invalidateCache("roadmaps:");
};

const connectionErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function guildVideoFromSnapshot(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  ownerId: string,
  ownerUsername: string,
): GuildVideo | null {
  const data = snapshot.data();
  const youtubeId = typeof data.videoId === "string" ? data.videoId : "";
  if (!youtubeId || data.addedBy !== ownerId || data.visibility === "private") return null;

  return {
    id: snapshot.id,
    videoId: youtubeId,
    title: typeof data.title === "string" && data.title ? data.title : "Untitled video",
    thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : "",
    category: typeof data.category === "string" && data.category ? data.category : "Other",
    tags: Array.isArray(data.tags)
      ? data.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
    description: typeof data.description === "string" ? data.description : "",
    channelTitle: typeof data.channelTitle === "string" ? data.channelTitle : undefined,
    duration: typeof data.duration === "string" ? data.duration : undefined,
    addedBy: ownerId,
    createdAt: data.createdAt,
    visibility: typeof data.visibility === "string" ? data.visibility : undefined,
    ownerUsername,
  };
}

function GuildVideoCard({
  video,
  importState,
  importing,
  onImport,
}: {
  video: GuildVideo;
  importState?: ImportState;
  importing: boolean;
  onImport: (video: GuildVideo) => void;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const thumbnail = thumbnailFailed || !video.thumbnail
    ? `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
    : video.thumbnail;
  const importedLabel = importState === "imported" ? "Imported" : "Already in collection";

  return (
    <article className="card flex h-full flex-col overflow-hidden rounded-lg">
      <a
        href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="group relative block aspect-video overflow-hidden bg-muted"
        aria-label={`Watch ${video.title} on YouTube`}
      >
        <img
          src={thumbnail}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={() => setThumbnailFailed(true)}
        />
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-foreground">
          YouTube <ExternalLink className="h-3 w-3" />
        </span>
      </a>
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="category-pill">{video.category}</span>
          <span className="truncate text-xs font-semibold text-primary">
            @{video.ownerUsername}
          </span>
        </div>
        <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground">
          {video.title}
        </h2>

        {video.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Video tags">
            {video.tags.map((tag, index) => (
              <span
                key={`${tag}-${index}`}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] gap-2 pt-5">
          <Button type="button" asChild variant="outline" className="px-3">
            <a
              href={`https://www.youtube.com/watch?v=${encodeURIComponent(video.videoId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch <ExternalLink />
            </a>
          </Button>
          <Button
            type="button"
            onClick={() => onImport(video)}
            disabled={importing || Boolean(importState)}
            className={importState ? "disabled:!bg-secondary disabled:!text-muted-foreground" : ""}
            aria-label={`${importState ? importedLabel : "Import"} ${video.title}`}
          >
            {importing ? <Loader2 className="animate-spin" /> : importState ? <Check /> : <Library />}
            {importing ? "Importing…" : importState ? importedLabel : "Import"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ConnectionPerson({ connection }: { connection: ConnectionView }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-semibold text-foreground">@{connection.other.username}</p>
      <p className="truncate text-xs text-muted-foreground">{connection.other.name}</p>
    </div>
  );
}

export default function GuildVideosClient() {
  const [user, setUser] = useState<User | null>(null);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [videos, setVideos] = useState<GuildVideo[]>([]);
  const [importStates, setImportStates] = useState<Record<string, ImportState>>({});
  const [importingId, setImportingId] = useState<string | null>(null);
  const [processingConnectionId, setProcessingConnectionId] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSuggestions, setUsernameSuggestions] = useState<UsernameSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const [suppressedSuggestionQuery, setSuppressedSuggestionQuery] = useState<string | null>(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshVersion = 0;
    let unsubscribeConnections = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      unsubscribeConnections();
      refreshVersion += 1;

      if (!currentUser) {
        window.location.replace("/");
        return;
      }

      try {
        const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));
        if (!active) return;
        if (!profileSnapshot.data()?.username) {
          window.location.replace("/onboarding");
          return;
        }

        setUser(currentUser);
        unsubscribeConnections = subscribeToUserConnectionDocuments(
          currentUser.uid,
          (connectionDocuments) => {
            const version = ++refreshVersion;
            void (async () => {
              try {
                setLoadError(false);
                const rawConnections = connectionDocuments.flatMap((connectionSnapshot) => {
                  const data = connectionSnapshot.data() as Partial<Connection>;
                  const participants = data.participants;
                  const validStatus = data.status === "pending" || data.status === "accepted";
                  if (
                    !Array.isArray(participants)
                    || participants.length !== 2
                    || !participants.every((uid) => typeof uid === "string")
                    || !participants.includes(currentUser.uid)
                    || typeof data.requesterId !== "string"
                    || typeof data.recipientId !== "string"
                    || !validStatus
                  ) return [];

                  return [{
                    id: connectionSnapshot.id,
                    participants: participants as [string, string],
                    requesterId: data.requesterId,
                    recipientId: data.recipientId,
                    status: data.status as Connection["status"],
                    createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
                    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
                  }];
                });

                const otherUid = (connection: Connection) =>
                  connection.participants.find((uid) => uid !== currentUser.uid) || "";
                const involvedIds = Array.from(new Set(rawConnections.map(otherUid).filter(Boolean)));
                const acceptedIds = Array.from(new Set(
                  rawConnections
                    .filter((connection) => connection.status === "accepted")
                    .map(otherUid)
                    .filter(Boolean),
                ));

                const ownVideosPromise = getDocs(query(
                  collection(db, "videos"),
                  where("addedBy", "==", currentUser.uid),
                ));
                const profilesPromise = Promise.all(involvedIds.map(async (uid) => ({
                  uid,
                  snapshot: await getDoc(doc(db, "users", uid)),
                })));
                const connectedVideoSnapshotsPromise = acceptedIds.length > 0
                  ? Promise.all(acceptedIds.map((uid) => getDocs(query(
                      collection(db, "videos"),
                      where("addedBy", "==", uid),
                      where("visibility", "==", "public"),
                    ))))
                  : Promise.resolve([]);

                const [ownVideoSnapshot, profileSnapshots, connectedVideoSnapshots] = await Promise.all([
                  ownVideosPromise,
                  profilesPromise,
                  connectedVideoSnapshotsPromise,
                ]);
                if (!active || version !== refreshVersion) return;

                const profiles = new Map<string, MemberProfile>();
                profileSnapshots.forEach(({ uid, snapshot: memberSnapshot }) => {
                  const data = memberSnapshot.data();
                  if (!memberSnapshot.exists() || typeof data?.username !== "string" || !data.username.trim()) return;
                  profiles.set(uid, {
                    uid,
                    username: data.username.trim().replace(/^@/, ""),
                    name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : data.username,
                  });
                });

                const views = rawConnections.flatMap((connection) => {
                  const other = profiles.get(otherUid(connection));
                  return other ? [{ ...connection, other }] : [];
                });
                views.sort((a, b) => b.updatedAt - a.updatedAt);

                const ownYoutubeIds = new Set<string>();
                ownVideoSnapshot.docs.forEach((videoSnapshot) => {
                  const videoId = videoSnapshot.data().videoId;
                  if (typeof videoId === "string" && videoId) ownYoutubeIds.add(videoId);
                });

                const guildVideos: GuildVideo[] = [];
                connectedVideoSnapshots.forEach((videoSnapshot, index) => {
                  const ownerId = acceptedIds[index];
                  const owner = profiles.get(ownerId);
                  if (!owner) return;
                  videoSnapshot.docs.forEach((snapshot) => {
                    const video = guildVideoFromSnapshot(snapshot, ownerId, owner.username);
                    if (video) guildVideos.push(video);
                  });
                });
                guildVideos.sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt));

                setConnections(views);
                setVideos(guildVideos);
                setImportStates(Object.fromEntries(
                  Array.from(ownYoutubeIds, (youtubeId) => [youtubeId, "existing" as const]),
                ));
                setOwnerFilter((current) => (
                  current === "all" || guildVideos.some((video) => video.ownerUsername === current)
                    ? current
                    : "all"
                ));
              } catch (error) {
                if (!active || version !== refreshVersion) return;
                console.error("Guild refresh error:", error);
                setLoadError(true);
                toast.error("Could not refresh connections and guild videos");
              } finally {
                if (active && version === refreshVersion) setLoading(false);
              }
            })();
          },
          (error) => {
            if (!active) return;
            console.error("Connections subscription error:", error);
            setLoadError(true);
            setLoading(false);
            toast.error("Could not load connections");
          },
        );
      } catch (error) {
        if (!active) return;
        console.error("Guild authentication error:", error);
        setLoadError(true);
        setLoading(false);
        toast.error("Could not load your SeenTube profile");
      }
    });

    return () => {
      active = false;
      refreshVersion += 1;
      unsubscribeConnections();
      unsubscribeAuth();
    };
  }, []);

  useEffect(() => {
    const prefix = normalizeUsername(usernameInput);
    if (!user || prefix.length < 2 || suppressedSuggestionQuery === prefix) {
      setUsernameSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsError(false);
      setSuggestionsOpen(false);
      return;
    }

    let cancelled = false;
    setSuggestionsOpen(true);
    setSuggestionsLoading(true);
    setSuggestionsError(false);

    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const usernameSnapshot = await getDocs(query(
            collection(db, "usernames"),
            orderBy(documentId()),
            startAt(prefix),
            endAt(`${prefix}\uf8ff`),
            limit(6),
          ));
          const matches = usernameSnapshot.docs
            .map((usernameDocument) => ({
              uid: usernameDocument.data().uid,
              username: usernameDocument.id,
            }))
            .filter((match): match is { uid: string; username: string } => (
              typeof match.uid === "string" && Boolean(match.uid) && match.uid !== user.uid
            ));
          const profileSnapshots = await Promise.all(matches.map(async (match) => ({
            match,
            snapshot: await getDoc(doc(db, "users", match.uid)),
          })));
          if (cancelled) return;

          setUsernameSuggestions(profileSnapshots.flatMap(({ match, snapshot }) => {
            const profile = snapshot.data();
            if (!snapshot.exists()) return [];
            const name = typeof profile?.name === "string" && profile.name.trim()
              ? profile.name.trim()
              : match.username;
            return [{
              uid: match.uid,
              username: match.username,
              name,
              image: typeof profile?.image === "string" && profile.image ? profile.image : null,
            }];
          }));
        } catch (error) {
          if (cancelled) return;
          console.error("Username suggestions error:", error);
          setUsernameSuggestions([]);
          setSuggestionsError(true);
        } finally {
          if (!cancelled) setSuggestionsLoading(false);
        }
      })();
    }, 275);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [suppressedSuggestionQuery, user, usernameInput]);

  const incomingConnections = useMemo(
    () => connections.filter((connection) => (
      connection.status === "pending" && connection.recipientId === user?.uid
    )),
    [connections, user?.uid],
  );
  const sentConnections = useMemo(
    () => connections.filter((connection) => (
      connection.status === "pending" && connection.requesterId === user?.uid
    )),
    [connections, user?.uid],
  );
  const acceptedConnections = useMemo(
    () => connections.filter((connection) => connection.status === "accepted"),
    [connections],
  );
  const connectionStateByUid = useMemo(() => Object.fromEntries(connections.map((connection) => {
    const label = connection.status === "accepted"
      ? "Connected"
      : connection.requesterId === user?.uid
        ? "Request sent"
        : "Requested you";
    return [connection.other.uid, label];
  })), [connections, user?.uid]);
  const owners = useMemo(
    () => Array.from(new Set(videos.map((video) => video.ownerUsername)))
      .sort((a, b) => a.localeCompare(b)),
    [videos],
  );

  const visibleVideos = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return videos.filter((video) => {
      if (ownerFilter !== "all" && video.ownerUsername !== ownerFilter) return false;
      if (!term) return true;
      return [video.title, video.category, video.ownerUsername, ...video.tags]
        .some((value) => value.toLocaleLowerCase().includes(term));
    });
  }, [ownerFilter, search, videos]);

  const sendRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.location.replace("/");
      return;
    }
    if (sendingRequest) return;

    const normalizedUsername = normalizeUsername(usernameInput);
    if (!normalizedUsername) {
      toast.error("Enter an exact @username");
      return;
    }

    setSendingRequest(true);
    try {
      const usernameSnapshot = await getDoc(doc(db, "usernames", normalizedUsername));
      const recipientId = usernameSnapshot.data()?.uid;
      if (!usernameSnapshot.exists() || typeof recipientId !== "string" || !recipientId) {
        throw new Error(`@${normalizedUsername} was not found.`);
      }
      if (recipientId === currentUser.uid) throw new Error("You cannot connect with yourself.");

      const existingConnection = connections.find((connection) => connection.other.uid === recipientId);
      if (existingConnection?.status === "accepted") {
        throw new Error(`You are already connected with @${normalizedUsername}.`);
      }
      if (existingConnection?.status === "pending") {
        throw new Error(existingConnection.requesterId === currentUser.uid
          ? `A connection request to @${normalizedUsername} is already pending.`
          : `@${normalizedUsername} has already sent you a request.`);
      }

      await sendConnectionRequest(currentUser.uid, recipientId);
      setUsernameInput("");
      setUsernameSuggestions([]);
      setSuggestionsOpen(false);
      setSuppressedSuggestionQuery(null);
      invalidateConnectionCaches();
      toast.success(`Connection request sent to @${normalizedUsername}`);
    } catch (error) {
      toast.error(connectionErrorMessage(error, "Could not send the connection request."));
    } finally {
      setSendingRequest(false);
    }
  };

  const respondToRequest = async (connection: ConnectionView, accept: boolean) => {
    const currentUser = auth.currentUser;
    if (!currentUser || processingConnectionId) return;
    setProcessingConnectionId(connection.id);
    try {
      await respondToConnectionRequest(connection.id, currentUser.uid, accept);
      invalidateConnectionCaches();
      toast.success(accept
        ? `You are now connected with @${connection.other.username}`
        : `Declined @${connection.other.username}'s request`);
    } catch (error) {
      toast.error(connectionErrorMessage(error, "Could not respond to this request."));
    } finally {
      setProcessingConnectionId(null);
    }
  };

  const removeExistingConnection = async (connection: ConnectionView) => {
    const currentUser = auth.currentUser;
    if (!currentUser || processingConnectionId) return;
    setProcessingConnectionId(connection.id);
    try {
      await removeConnection(connection.id, currentUser.uid);
      invalidateConnectionCaches();
      toast.success(connection.status === "pending"
        ? `Cancelled request to @${connection.other.username}`
        : `Disconnected from @${connection.other.username}`);
    } catch (error) {
      toast.error(connectionErrorMessage(error, "Could not update this connection."));
    } finally {
      setProcessingConnectionId(null);
    }
  };

  const importVideo = async (video: GuildVideo) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      window.location.replace("/");
      return;
    }
    if (importingId || importStates[video.videoId]) return;

    setImportingId(video.id);
    try {
      const destinationId = `${currentUser.uid}_${video.videoId}`;
      const destinationRef = doc(db, "videos", destinationId);
      const statusRef = doc(db, "videoStatuses", `${destinationId}_${currentUser.uid}`);

      const created = await runTransaction(db, async (transaction) => {
        const destinationSnapshot = await transaction.get(destinationRef);
        if (destinationSnapshot.exists()) return false;

        const now = Date.now();
        const importedVideo: Record<string, unknown> = {
          videoId: video.videoId,
          title: video.title,
          thumbnail: video.thumbnail,
          category: video.category,
          tags: video.tags,
          description: video.description,
          addedBy: currentUser.uid,
          visibility: "public",
          sourceVideoId: video.id,
          sourceOwnerId: video.addedBy,
          createdAt: now,
        };
        if (video.channelTitle) importedVideo.channelTitle = video.channelTitle;
        if (video.duration) importedVideo.duration = video.duration;

        transaction.set(destinationRef, importedVideo);
        transaction.set(statusRef, {
          videoId: destinationId,
          userId: currentUser.uid,
          status: "pending",
          progress: 0,
          updatedAt: now,
        });
        return true;
      });
      setImportStates((current) => ({
        ...current,
        [video.videoId]: created ? "imported" : "existing",
      }));
      invalidateCache("videos:");
      invalidateCache("dashboard:");
      invalidateCache("guild:");
      toast.success(created ? "Video imported to your collection" : "Already in your collection");
    } catch (error) {
      console.error("Guild video import error:", error);
      toast.error("Could not import this video. Please try again.");
    } finally {
      setImportingId(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
        <div className="space-y-2">
          <div className="h-9 w-64 animate-shimmer rounded-md" />
          <div className="h-5 w-96 max-w-full animate-shimmer rounded-md" />
        </div>
        <div className="h-52 animate-shimmer rounded-lg" />
        <div className="h-12 animate-shimmer rounded-lg" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div key={item} className="h-80 animate-shimmer rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Users className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-widest">Shared by connections</span>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">
          Guild <span className="text-primary">Videos</span>
        </h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Connect with SeenTube members, discover their public videos, and import favorites into your collection.
        </p>
      </header>

      <section className="card space-y-5 rounded-xl p-4 sm:p-6" aria-labelledby="connections-heading">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <h2 id="connections-heading" className="text-xl font-bold">Connections</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Share guild videos only with people you choose.
            </p>
          </div>
          <form onSubmit={sendRequest} className="flex w-full gap-2 lg:max-w-md">
            <div className="relative min-w-0 flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span>
              <Input
                value={usernameInput}
                onChange={(event) => {
                  const nextUsername = event.target.value.replace(/^@/, "");
                  setUsernameInput(nextUsername);
                  setSuppressedSuggestionQuery(null);
                  setSuggestionsOpen(normalizeUsername(nextUsername).length >= 2);
                }}
                onFocus={() => {
                  const prefix = normalizeUsername(usernameInput);
                  if (prefix.length >= 2 && suppressedSuggestionQuery !== prefix) {
                    setSuggestionsOpen(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.preventDefault();
                  setSuppressedSuggestionQuery(normalizeUsername(usernameInput));
                  setSuggestionsOpen(false);
                }}
                placeholder="exact_username"
                className="pl-7"
                aria-label="Exact username to connect with"
                aria-autocomplete="list"
                aria-controls="username-suggestions"
                aria-expanded={suggestionsOpen}
                role="combobox"
                autoComplete="off"
                disabled={sendingRequest}
              />
              {suggestionsOpen && (
                <div
                  id="username-suggestions"
                  role="listbox"
                  aria-label="Username suggestions"
                  aria-busy={suggestionsLoading}
                  className="absolute left-0 right-0 top-full z-30 mt-2 max-h-80 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-xl"
                >
                  {suggestionsLoading ? (
                    <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground" role="status">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching usernames…
                    </div>
                  ) : suggestionsError ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
                      Could not load suggestions.
                    </p>
                  ) : usernameSuggestions.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground" role="status">
                      No matching usernames.
                    </p>
                  ) : usernameSuggestions.map((suggestion) => {
                    const connectionState = connectionStateByUid[suggestion.uid];
                    return (
                      <button
                        key={suggestion.uid}
                        type="button"
                        role="option"
                        aria-selected="false"
                        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors hover:bg-secondary focus:bg-secondary focus:outline-none"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setUsernameInput(suggestion.username);
                          setSuppressedSuggestionQuery(normalizeUsername(suggestion.username));
                          setUsernameSuggestions([]);
                          setSuggestionsOpen(false);
                        }}
                      >
                        {suggestion.image ? (
                          <img
                            src={suggestion.image}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary" aria-hidden="true">
                            {(suggestion.name || suggestion.username).charAt(0).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-foreground">{suggestion.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">@{suggestion.username}</span>
                        </span>
                        {connectionState && (
                          <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                            {connectionState}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Button type="submit" disabled={sendingRequest || !usernameInput.trim()}>
              {sendingRequest ? <Loader2 className="animate-spin" /> : <UserPlus />}
              <span className="hidden sm:inline">Connect</span>
            </Button>
          </form>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Incoming requests</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                {incomingConnections.length}
              </span>
            </div>
            <div className="space-y-2">
              {incomingConnections.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No incoming requests.</p>
              ) : incomingConnections.map((connection) => {
                const processing = processingConnectionId === connection.id;
                return (
                  <div key={connection.id} className="space-y-3 rounded-lg border border-border p-3">
                    <ConnectionPerson connection={connection} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => respondToRequest(connection, true)}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="animate-spin" /> : <Check />}
                        Accept
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => respondToRequest(connection, false)}
                        disabled={processing}
                      >
                        <X /> Decline
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Sent requests</h3>
              <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">
                {sentConnections.length}
              </span>
            </div>
            <div className="space-y-2">
              {sentConnections.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No requests waiting.</p>
              ) : sentConnections.map((connection) => {
                const processing = processingConnectionId === connection.id;
                return (
                  <div key={connection.id} className="space-y-3 rounded-lg border border-border p-3">
                    <ConnectionPerson connection={connection} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" variant="secondary" disabled>
                        <Send /> Sent
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeExistingConnection(connection)}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="animate-spin" /> : <X />}
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-background/50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-bold">Connected users</h3>
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                {acceptedConnections.length}
              </span>
            </div>
            <div className="space-y-2">
              {acceptedConnections.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No connections yet.</p>
              ) : acceptedConnections.map((connection) => {
                const processing = processingConnectionId === connection.id;
                return (
                  <div key={connection.id} className="space-y-3 rounded-lg border border-border p-3">
                    <ConnectionPerson connection={connection} />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" variant="secondary" disabled>
                        <UserCheck /> Connected
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => removeExistingConnection(connection)}
                        disabled={processing}
                      >
                        {processing ? <Loader2 className="animate-spin" /> : <UserMinus />}
                        Disconnect
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-5" aria-labelledby="guild-library-heading">
        <div>
          <h2 id="guild-library-heading" className="text-2xl font-bold">Connection videos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Public videos shared by people you have accepted connections with.
          </p>
        </div>

        {acceptedConnections.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-5 py-16 text-center">
            <UserPlus className="mx-auto mb-3 h-9 w-9 text-primary" />
            <h3 className="text-lg font-semibold">Connect to unlock guild videos</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Send a connection request by exact @username, or accept an incoming request first.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-3" aria-label="Filter guild videos">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search titles, categories, tags, or @username"
                  className="pl-9"
                  aria-label="Search guild videos"
                />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by member">
                <Button
                  type="button"
                  size="sm"
                  variant={ownerFilter === "all" ? "default" : "secondary"}
                  onClick={() => setOwnerFilter("all")}
                >
                  All members
                </Button>
                {owners.map((owner) => (
                  <Button
                    key={owner}
                    type="button"
                    size="sm"
                    variant={ownerFilter === owner ? "default" : "secondary"}
                    onClick={() => setOwnerFilter(owner)}
                  >
                    @{owner}
                  </Button>
                ))}
              </div>
            </div>

            {visibleVideos.length > 0 ? (
              <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {visibleVideos.map((video) => (
                  <GuildVideoCard
                    key={video.id}
                    video={video}
                    importState={importStates[video.videoId]}
                    importing={importingId === video.id}
                    onImport={importVideo}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border px-5 py-16 text-center">
                <Users className="mx-auto mb-3 h-9 w-9 text-primary" />
                <h3 className="text-lg font-semibold">
                  {loadError ? "Guild videos are unavailable" : videos.length ? "No videos match" : "No shared videos yet"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {loadError
                    ? "Please refresh and try again."
                    : videos.length
                      ? "Try another search or member filter."
                      : "Your connections' public videos will appear here."}
                </p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}