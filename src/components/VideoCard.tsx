"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  MoreVertical,
  Clock,
  Eye,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Tag,
  Calendar,
  User,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import StatusBadge from "./StatusBadge";
import { cn, formatRelativeDate, getFriendStatusMessage } from "@/lib/utils";
import type { VideoStatusEnum } from "@/lib/constants";
import { toast } from "sonner";
import { db, auth } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
} from "firebase/firestore";
import { invalidateCache } from "@/lib/data-cache";
import { deleteProtectedResource } from "@/lib/delete-resource";
import DeletePasswordDialog from "@/components/DeletePasswordDialog";

export interface VideoCardData {
  id: string;           // Firestore doc ID
  videoId: string;      // YouTube video ID (e.g. dQw4w9WgXcQ)
  title: string;
  thumbnail: string;
  category: string;
  tags: string[];
  description: string;
  createdAt: number;
  addedBy: string;      // user UID who added the video
  myStatus: VideoStatusEnum;
  friendStatus: VideoStatusEnum | null;
  friendName: string | null;
  friendAvatar: string | null;
  friendId: string | null;
  myStatusDocId: string | null; // the Firestore ID of my videoStatuses doc
}

interface VideoCardProps {
  video: VideoCardData;
  currentUserId: string;
  index?: number;
  onStatusChange?: (videoId: string, newStatus: VideoStatusEnum) => void;
  onDelete?: (videoId: string) => void;
  /** Compact mode: used when the mobile grid shows 2 narrow cards per row.
   * Hides secondary info (description, tags, friend status) below the `sm`
   * breakpoint. Above `sm` (tablet/desktop) full details always show. */
  compact?: boolean;
}

const statusOptions: Array<{
  value: VideoStatusEnum;
  label: string;
  icon: typeof Clock;
  description: string;
  activeClass: string;
  iconActiveClass: string;
}> = [
  {
    value: "pending",
    label: "Pending",
    icon: Clock,
    description: "Haven't watched yet",
    activeClass: "bg-[hsl(var(--status-pending-bg))] text-[hsl(var(--status-pending-text))]",
    iconActiveClass: "text-[hsl(var(--status-pending-text))]",
  },
  {
    value: "partially_watched",
    label: "Partially Watched",
    icon: Eye,
    description: "Started watching",
    activeClass: "bg-[hsl(var(--status-partial-bg))] text-[hsl(var(--status-partial-text))]",
    iconActiveClass: "text-[hsl(var(--status-partial-text))]",
  },
  {
    value: "watched",
    label: "Watched",
    icon: CheckCircle2,
    description: "Fully watched",
    activeClass: "bg-[hsl(var(--status-watched-bg))] text-[hsl(var(--status-watched-text))]",
    iconActiveClass: "text-[hsl(var(--status-watched-text))]",
  },
];

const categoryColors: Record<string, string> = Object.fromEntries(
  [
    "Music",
    "Gaming",
    "Education",
    "Entertainment",
    "Tech",
    "News",
    "Vlog",
    "Other",
    "default",
  ].map((category) => [
    category,
    "text-foreground bg-secondary border-border",
  ])
);

export default function VideoCard({
  video,
  currentUserId,
  index = 0,
  onStatusChange,
  onDelete,
  compact = false,
}: VideoCardProps) {
  const [myStatus, setMyStatus] = useState<VideoStatusEnum>(video.myStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  const isCreator = video.addedBy === currentUserId;
  const catClass = categoryColors[video.category] ?? categoryColors.default;
  const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;

  const handleStatusChange = async (newStatus: VideoStatusEnum) => {
    if (newStatus === myStatus || isUpdating) return;
    if (myStatus === "watched") {
      toast.error("Fully watched videos are locked and cannot change status.");
      return;
    }
    setIsUpdating(true);
    const prevStatus = myStatus;

    // Optimistic update
    setMyStatus(newStatus);

    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Not logged in");

      // Find the existing status doc for this user + video
      let statusDocId = video.myStatusDocId;

      if (!statusDocId) {
        // Look it up
        const q = query(
          collection(db, "videoStatuses"),
          where("videoId", "==", video.id),
          where("userId", "==", user.uid)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          statusDocId = snap.docs[0].id;
        }
      }

      if (statusDocId) {
        // Update existing
        await setDoc(
          doc(db, "videoStatuses", statusDocId),
          { status: newStatus, updatedAt: Date.now() },
          { merge: true }
        );
      } else {
        // Deterministic ID matches Add Video / Guild import.
        const newDocId = `${video.id}_${user.uid}`;
        await setDoc(doc(db, "videoStatuses", newDocId), {
          videoId: video.id,
          userId: user.uid,
          status: newStatus,
          progress: 0,
          updatedAt: Date.now(),
        });
      }

      invalidateCache("videos:");
      invalidateCache("dashboard:");

      toast.success(`Status updated to "${newStatus.replace(/_/g, " ")}"`);
      onStatusChange?.(video.id, newStatus);
    } catch (err) {
      console.error(err);
      setMyStatus(prevStatus);
      toast.error("Failed to update status. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async (password: string) => {
    if (!isCreator) throw new Error("Only the video owner can delete it.");
    try {
      await deleteProtectedResource("video", video.id, password);
      invalidateCache("videos:");
      invalidateCache("dashboard:");
      toast.success("Video removed from collection");
      onDelete?.(video.id);
    } catch (error) {
      console.error("Protected video deletion failed:", error);
      throw error instanceof Error ? error : new Error("Failed to delete video.");
    }
  };

  const thumbnailSrc = thumbnailError
    ? `https://img.youtube.com/vi/${video.videoId}/hqdefault.jpg`
    : video.thumbnail;

  return (
    <>
      <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: "easeOut" }}
      className={cn("card flex h-full flex-col rounded-lg overflow-hidden group", `card-tint-${myStatus}`)}
      layout
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-muted shrink-0">
        <img
          src={thumbnailSrc}
          alt={video.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={() => setThumbnailError(true)}
          loading="lazy"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Open in YouTube button */}
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 right-2 p-2 rounded-full bg-white text-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 elevation-1 hover:bg-secondary"
          title="Watch on YouTube"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {/* Status badge overlay */}
        <div className={cn("absolute left-2 bottom-2", compact && "left-1.5 bottom-1.5")}>
          <StatusBadge
            status={myStatus}
            size={compact ? "xs" : "sm"}
            short={compact}
            className={cn(compact && "sm:hidden")}
          />
          {compact && (
            <StatusBadge status={myStatus} size="sm" className="hidden sm:inline-flex" />
          )}
        </div>
      </div>

      {/* Content */}
      <div className={cn("flex flex-1 flex-col gap-3", compact ? "p-3 sm:p-4 sm:gap-3 gap-2" : "p-4")}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-1.5">
          <div className="flex-1 min-w-0">
            {/* Category */}
            <span
              className={cn(
                "inline-block font-medium rounded-full border mb-1.5",
                compact ? "text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5" : "text-xs px-2 py-0.5",
                catClass
              )}
            >
              {video.category}
            </span>
            {/* Title — reserve 2 lines so card bodies stay even */}
            <h3
              className={cn(
                "font-display font-semibold leading-snug text-foreground line-clamp-2 min-h-[2.5em] group-hover:text-primary transition-colors",
                compact ? "text-xs sm:text-sm" : "text-sm"
              )}
            >
              {video.title}
            </h3>
          </div>

          {/* Context Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "rounded-lg hover:bg-accent transition-colors shrink-0 mt-0.5 opacity-60 hover:opacity-100",
                  compact ? "p-1 sm:p-1.5" : "p-1.5"
                )}
                disabled={isUpdating}
                aria-label="Video options"
              >
                <MoreVertical className={cn(compact ? "w-3.5 h-3.5 sm:w-4 sm:h-4" : "w-4 h-4")} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>My Status</DropdownMenuLabel>
              {myStatus === "watched" && (
                <p className="px-2 pb-2 text-xs text-muted-foreground">
                  Fully watched — status is locked.
                </p>
              )}
              {statusOptions.map(({ value, label, icon: Icon, description, activeClass, iconActiveClass }) => {
                const isActive = myStatus === value;
                const isLocked = myStatus === "watched" && !isActive;
                return (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => handleStatusChange(value)}
                    disabled={isLocked}
                    className={cn("gap-3", isActive && activeClass, isLocked && "opacity-50")}
                  >
                    <Icon className={cn("w-4 h-4 shrink-0", isActive && iconActiveClass)} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium">{label}</div>
                      <div className={cn("text-xs", isActive ? "opacity-70" : "text-muted-foreground")}>
                        {isLocked ? "Locked" : description}
                      </div>
                    </div>
                    {isActive && (
                      <CheckCircle2 className={cn("w-3.5 h-3.5 shrink-0", iconActiveClass)} />
                    )}
                  </DropdownMenuItem>
                );
              })}
              {isCreator && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setDeleteDialogOpen(true)}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove video
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description — always reserve height so labels align across cards */}
        <p
          className={cn(
            "text-xs text-muted-foreground line-clamp-2 min-h-[2.5em] leading-relaxed",
            compact && "hidden sm:block",
            !video.description && "invisible",
          )}
        >
          {video.description || "\u00A0"}
        </p>

        {/* Tags — always reserve one row so chips align across cards */}
        <div
          className={cn(
            "flex min-h-6 flex-wrap content-start gap-1.5",
            compact && "hidden sm:flex",
          )}
        >
          {(video.tags?.length ? video.tags : []).slice(0, 2).map((tag, tagIndex) => (
            <span
              key={`${tag}-${tagIndex}`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 border border-border/50 rounded-full px-2 py-0.5"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
        </div>

        {/* Footer always sits on the card bottom across the grid row */}
        <div className={cn("mt-auto flex flex-col gap-3 pt-1", compact && "gap-1.5 sm:gap-3")}>
          <div className="h-px bg-border/40" />

          {/* Status section */}
          <div className={cn("flex flex-col gap-2", compact && "gap-1.5 sm:gap-2")}>
            {/* My Status */}
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-xs text-muted-foreground flex items-center gap-1.5 shrink-0", compact && "text-[11px] sm:text-xs sm:gap-1.5 gap-1")}>
                <User className="w-3 h-3" />
                {compact ? (
                  <>
                    <span className="hidden sm:inline">My status</span>
                    <span className="sm:hidden">Status</span>
                  </>
                ) : (
                  "My status"
                )}
              </span>
              {compact ? (
                <>
                  <StatusBadge status={myStatus} size="xs" short className="sm:hidden" />
                  <StatusBadge status={myStatus} size="sm" className="hidden sm:inline-flex" />
                </>
              ) : (
                <StatusBadge status={myStatus} size="sm" />
              )}
            </div>

            {/* Friend Status - only show if friendId is different from current user */}
            {video.friendStatus && video.friendName && video.friendId !== currentUserId && (
              <div className={cn("rounded-lg bg-muted/30 border border-border/40 px-3 py-2", compact && "hidden sm:block")}>
                <div className="flex items-center gap-2 mb-1">
                  {video.friendAvatar ? (
                    <img
                      src={video.friendAvatar}
                      alt={video.friendName}
                      className="w-4 h-4 rounded-full"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-[8px] font-bold text-primary">
                        {video.friendName[0]}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {getFriendStatusMessage(video.friendName, video.friendStatus)}
                  </p>
                </div>
                <StatusBadge status={video.friendStatus} size="sm" />
              </div>
            )}
          </div>

          {/* Date */}
          <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", compact && "text-[11px] sm:text-xs")}>
            <Calendar className="w-3 h-3 shrink-0" />
            {formatRelativeDate(video.createdAt)}
          </div>
        </div>
      </div>
      </motion.div>
      <DeletePasswordDialog
        open={deleteDialogOpen}
        resourceName={video.title}
        resourceLabel="video"
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
      />
    </>
  );
}
