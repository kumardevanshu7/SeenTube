import type { APIRoute } from "astro";
import {
  authenticateRequest,
  DeletionSecurityError,
  FirebaseAdminConfigurationError,
  getAdminDb,
  isTrustedBrowserOrigin,
  verifyDeletionAnswer,
} from "@/lib/server/deletion-security";

export const prerender = false;

const MAX_BULK_VIDEOS = 40;

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
);

const parseResourceIds = (body: Record<string, unknown>) => {
  if (Array.isArray(body.resourceIds)) {
    return body.resourceIds
      .filter((id): id is string => typeof id === "string" && Boolean(id) && !id.includes("/"))
      .slice(0, MAX_BULK_VIDEOS);
  }
  if (typeof body.resourceId === "string" && body.resourceId && !body.resourceId.includes("/")) {
    return [body.resourceId];
  }
  return [];
};

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedBrowserOrigin(request)) return json(403, { error: "Request denied." });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, { error: "JSON request required." });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 32_768) return json(413, { error: "Request is too large." });

  try {
    const decodedToken = await authenticateRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const answer = typeof body.answer === "string" ? body.answer : "";
    const resourceType = body.resourceType;
    const resourceIds = parseResourceIds(body);

    if (resourceIds.length === 0 || (resourceType !== "roadmap" && resourceType !== "video")) {
      return json(400, { error: "Invalid deletion request." });
    }
    if (resourceType === "roadmap" && resourceIds.length !== 1) {
      return json(400, { error: "Roadmaps must be deleted one at a time." });
    }
    await verifyDeletionAnswer(decodedToken.uid, answer);

    const firestore = getAdminDb();
    if (resourceType === "roadmap") {
      const roadmapRef = firestore.collection("roadmaps").doc(resourceIds[0]);
      await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(roadmapRef);
        if (!snapshot.exists) throw new Error("NOT_FOUND");
        if (snapshot.data()?.ownerId !== decodedToken.uid) throw new Error("FORBIDDEN");
        transaction.delete(roadmapRef);
      });
      return json(200, { deleted: true, deletedIds: resourceIds });
    }

    const deletedIds: string[] = [];
    for (const resourceId of resourceIds) {
      const videoRef = firestore.collection("videos").doc(resourceId);
      const [videoSnapshot, statusesSnapshot] = await Promise.all([
        videoRef.get(),
        firestore.collection("videoStatuses").where("videoId", "==", resourceId).get(),
      ]);
      if (!videoSnapshot.exists) continue;
      if (videoSnapshot.data()?.addedBy !== decodedToken.uid) throw new Error("FORBIDDEN");
      if (statusesSnapshot.size > 498) throw new Error("TOO_MANY_STATUS_RECORDS");
      const batch = firestore.batch();
      batch.delete(videoRef);
      statusesSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
      await batch.commit();
      deletedIds.push(resourceId);
    }

    if (deletedIds.length === 0) throw new Error("NOT_FOUND");
    return json(200, { deleted: true, deletedIds });
  } catch (error) {
    if (error instanceof FirebaseAdminConfigurationError) {
      return json(503, { error: error.message, code: "ADMIN_NOT_CONFIGURED" });
    }
    if (error instanceof DeletionSecurityError) {
      const status = error.code === "NOT_CONFIGURED" ? 428 : error.code === "LOCKED" ? 429 : 403;
      return json(status, { error: error.message, code: error.code });
    }
    if (error instanceof Error && error.message === "UNAUTHENTICATED") return json(401, { error: "Please sign in again." });
    if (error instanceof Error && error.message === "NOT_FOUND") return json(404, { error: "This item no longer exists." });
    if (error instanceof Error && error.message === "FORBIDDEN") return json(403, { error: "You can only delete your own items." });
    console.error("Protected deletion failed:", error instanceof Error ? error.message : "Unknown error");
    return json(500, { error: "Deletion could not be completed." });
  }
};
