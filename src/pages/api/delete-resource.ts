import type { APIRoute } from "astro";
import {
  authenticateRequest,
  DeletionSecurityError,
  FirebaseAdminConfigurationError,
  getAdminDb,
  verifyDeletionAnswer,
} from "@/lib/server/deletion-security";

export const prerender = false;

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
);

export const POST: APIRoute = async ({ request }) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return json(403, { error: "Request denied." });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return json(415, { error: "JSON request required." });
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return json(413, { error: "Request is too large." });

  try {
    const decodedToken = await authenticateRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const answer = typeof body.answer === "string" ? body.answer : "";
    const resourceId = typeof body.resourceId === "string" ? body.resourceId : "";
    const resourceType = body.resourceType;

    if (!resourceId || resourceId.includes("/") || (resourceType !== "roadmap" && resourceType !== "video")) {
      return json(400, { error: "Invalid deletion request." });
    }
    await verifyDeletionAnswer(decodedToken.uid, answer);

    const firestore = getAdminDb();
    if (resourceType === "roadmap") {
      const roadmapRef = firestore.collection("roadmaps").doc(resourceId);
      await firestore.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(roadmapRef);
        if (!snapshot.exists) throw new Error("NOT_FOUND");
        if (snapshot.data()?.ownerId !== decodedToken.uid) throw new Error("FORBIDDEN");
        transaction.delete(roadmapRef);
      });
    } else {
      const videoRef = firestore.collection("videos").doc(resourceId);
      const [videoSnapshot, statusesSnapshot] = await Promise.all([
        videoRef.get(),
        firestore.collection("videoStatuses").where("videoId", "==", resourceId).get(),
      ]);
      if (!videoSnapshot.exists) throw new Error("NOT_FOUND");
      if (videoSnapshot.data()?.addedBy !== decodedToken.uid) throw new Error("FORBIDDEN");
      if (statusesSnapshot.size > 498) throw new Error("TOO_MANY_STATUS_RECORDS");
      const batch = firestore.batch();
      batch.delete(videoRef);
      statusesSnapshot.docs.forEach((snapshot) => batch.delete(snapshot.ref));
      await batch.commit();
    }

    return json(200, { deleted: true });
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