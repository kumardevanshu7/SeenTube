import type { APIRoute } from "astro";

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

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return json(400, { error: "URL is required" });

  try {
    const videoIdMatch = url.match(
      /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    );
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
      thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
      youtubeId: videoId,
    });
  } catch (error) {
    console.error("YouTube Meta API Error:", error);
    return json(500, { error: "Internal Server Error" });
  }
};
