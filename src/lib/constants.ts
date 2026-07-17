export const CATEGORIES = [
  "Music",
  "Gaming",
  "Education",
  "Entertainment",
  "Tech",
  "News",
  "Vlog",
  "Mind Roadmap",
  "Other",
] as const;

export type VideoStatusEnum = "pending" | "partially_watched" | "watched";
export type Visibility = "public" | "private";

export interface Video {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle?: string;
  duration?: string;
  category: string;
  tags: string[];
  description?: string;
  addedBy: string;
  visibility?: Visibility;
  sourceVideoId?: string;
  sourceOwnerId?: string;
  createdAt: number;
}

export interface VideoStatus {
  id: string;
  videoId: string;
  userId: string;
  status: VideoStatusEnum;
  progress: number;
  updatedAt: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  image: string | null;
  username: string;
  usernameNormalized: string;
}