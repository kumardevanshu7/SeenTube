import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { VideoStatusEnum } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Extract YouTube video ID from various URL formats
export function extractYouTubeId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // youtube.com/watch?v=...
    if (
      urlObj.hostname.includes("youtube.com") &&
      urlObj.pathname === "/watch"
    ) {
      return urlObj.searchParams.get("v");
    }
    // youtu.be/...
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1).split("?")[0];
    }
    // youtube.com/shorts/...
    if (urlObj.pathname.startsWith("/shorts/")) {
      return urlObj.pathname.replace("/shorts/", "").split("?")[0];
    }
    // youtube.com/embed/...
    if (urlObj.pathname.startsWith("/embed/")) {
      return urlObj.pathname.replace("/embed/", "").split("?")[0];
    }
    return null;
  } catch {
    return null;
  }
}

export function getYouTubeThumbnail(
  videoId: string,
  quality: "max" | "high" | "medium" | "default" = "max"
): string {
  const qualityMap = {
    max: "maxresdefault",
    high: "hqdefault",
    medium: "mqdefault",
    default: "default",
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

export function formatStatus(status: VideoStatusEnum): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "partially_watched":
      return "Partially Watched";
    case "watched":
      return "Watched";
    default:
      return status;
  }
}

export function getFriendStatusMessage(
  friendName: string,
  status: VideoStatusEnum
): string {
  const firstName = friendName.split(" ")[0];
  switch (status) {
    case "watched":
      return `${firstName} watched this entire video.`;
    case "partially_watched":
      return `${firstName} partially watched this video.`;
    case "pending":
      return `${firstName} has kept this in pending.`;
    default:
      return `${firstName} has not set a status yet.`;
  }
}

export function getStatusColor(status: VideoStatusEnum): string {
  switch (status) {
    case "pending":
      return "amber";
    case "partially_watched":
      return "blue";
    case "watched":
      return "green";
    default:
      return "gray";
  }
}

export function formatDate(date: Date | number | string): string {
  const d = new Date(
    typeof date === "number" ? date * 1000 : date
  );
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatRelativeDate(date: Date | number | string): string {
  const d = new Date(typeof date === "number" ? date * 1000 : date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 30) return formatDate(date);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}
