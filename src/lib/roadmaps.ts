export type Visibility = "public" | "private";
export type RoadmapStepStatus = "completed" | "not_completed" | "pending";

export type RoadmapStep = {
  id: string;
  url: string;
  youtubeId: string;
  title: string;
  thumbnail: string;
  status: RoadmapStepStatus;
};

export type Roadmap = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  visibility: Visibility;
  steps: RoadmapStep[];
  createdAt: unknown;
  updatedAt: unknown;
  sourceRoadmapId?: string;
  sourceOwnerId?: string;
};

export const timeValue = (value: unknown) => {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
};

export const makeStepId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Always build watch links from youtubeId — never trust freeform stored URLs. */
export const youtubeWatchUrl = (youtubeId: string) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`;

export const youtubeThumbnailUrl = (youtubeId: string) =>
  `https://img.youtube.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;

export const normalizeStepStatus = (value: unknown): RoadmapStepStatus =>
  value === "completed" || value === "not_completed" ? value : "pending";
export const normalizeRoadmap = (
  id: string,
  data: Record<string, unknown>,
): Roadmap | null => {
  if (typeof data.ownerId !== "string" || !data.ownerId) return null;
  const rawSteps = Array.isArray(data.steps) ? data.steps : [];
  const steps = rawSteps.flatMap((value, index) => {
    if (!value || typeof value !== "object") return [];
    const step = value as Record<string, unknown>;
    if (typeof step.youtubeId !== "string" || !step.youtubeId) return [];
    return [{
      id: typeof step.id === "string" && step.id ? step.id : `${id}-step-${index}`,
      url: typeof step.url === "string" && step.url
        ? step.url
        : `https://www.youtube.com/watch?v=${encodeURIComponent(step.youtubeId)}`,
      youtubeId: step.youtubeId,
      title: typeof step.title === "string" && step.title ? step.title : "Untitled video",
      thumbnail: typeof step.thumbnail === "string" ? step.thumbnail : "",
      status: normalizeStepStatus(step.status),
    } satisfies RoadmapStep];
  });

  return {
    id,
    ownerId: data.ownerId,
    title: typeof data.title === "string" && data.title ? data.title : "Untitled roadmap",
    description: typeof data.description === "string" ? data.description : "",
    visibility: data.visibility === "public" ? "public" : "private",
    steps,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    sourceRoadmapId: typeof data.sourceRoadmapId === "string" ? data.sourceRoadmapId : undefined,
    sourceOwnerId: typeof data.sourceOwnerId === "string" ? data.sourceOwnerId : undefined,
  };
};

export function getRoadmapProgress(roadmap: Pick<Roadmap, "steps">) {
  const total = roadmap.steps.length;
  const completed = roadmap.steps.filter((step) => step.status === "completed").length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { completed, total, percentage };
}
