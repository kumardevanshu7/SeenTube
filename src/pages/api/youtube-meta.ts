import type { APIRoute } from "astro";
import {
  authenticateRequest,
  FirebaseAdminConfigurationError,
  isFirebaseAdminConfigured,
} from "@/lib/server/deletion-security";

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  },
);

const YOUTUBE_ID_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[^\w-]|$)/;

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  try {
    if (!isFirebaseAdminConfigured()) {
      return json(503, { error: "Video lookup is temporarily unavailable." });
    }
    await authenticateRequest(request);
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) {
      return json(503, { error: "Video lookup is temporarily unavailable." });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return json(401, { error: "Please sign in again." });
    }
    return json(401, { error: "Please sign in again." });
  }

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return json(400, { error: "URL is required" });

  try {
    const videoIdMatch = url.match(YOUTUBE_ID_RE);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;
    if (!videoId) return json(400, { error: "Invalid YouTube URL" });

    const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
    );
    if (!oembedRes.ok) return json(404, { error: "Could not fetch video details" });

    const data = await oembedRes.json() as { title?: unknown };
    if (typeof data.title !== "string" || !data.title) {
      return json(502, { error: "YouTube returned invalid video details" });
    }

    return json(200, {
      title: data.title,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      youtubeId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  } catch (error) {
    console.error("YouTube Meta API Error:", error);
    return json(500, { error: "Internal Server Error" });
  }
};
