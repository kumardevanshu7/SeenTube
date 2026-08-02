import type { APIRoute } from "astro";
import {
  authenticateRequest,
  changeDeletionSecurity,
  DeletionSecurityError,
  FirebaseAdminConfigurationError,
  getDeletionSecurity,
  isFirebaseAdminConfigured,
  isTrustedBrowserOrigin,
  setupDeletionSecurity,
  verifyDeletionAnswer,
} from "@/lib/server/deletion-security";

export const prerender = false;

const json = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
);

const securityErrorResponse = (error: unknown) => {
  if (error instanceof FirebaseAdminConfigurationError) {
    return json(503, { error: error.message, code: "ADMIN_NOT_CONFIGURED" });
  }
  if (error instanceof DeletionSecurityError) {
    const status = error.code === "LOCKED" ? 429
      : error.code === "NOT_CONFIGURED" ? 428
        : error.code === "ALREADY_CONFIGURED" ? 409
          : 403;
    return json(status, { error: error.message, code: error.code });
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return json(401, { error: "Please sign in again." });
  }
  if (error instanceof Error && /must be|characters/.test(error.message)) {
    return json(400, { error: error.message });
  }
  console.error("Deletion security request failed:", error instanceof Error ? error.message : "Unknown error");
  return json(500, { error: "Deletion security could not be updated." });
};

export const GET: APIRoute = async ({ request }) => {
  if (!isFirebaseAdminConfigured()) {
    return json(200, {
      configured: false,
      serverConfigured: false,
      error: "Firebase Admin setup is required before deletion security can be used.",
    });
  }
  try {
    const user = await authenticateRequest(request);
    return json(200, await getDeletionSecurity(user.uid));
  } catch (error) {
    return securityErrorResponse(error);
  }
};

export const POST: APIRoute = async ({ request }) => {
  if (!isTrustedBrowserOrigin(request)) return json(403, { error: "Request denied." });
  if (!request.headers.get("content-type")?.includes("application/json")) return json(415, { error: "JSON request required." });
  if (Number(request.headers.get("content-length") || 0) > 4096) return json(413, { error: "Request is too large." });

  try {
    const user = await authenticateRequest(request);
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const text = (key: string) => typeof body[key] === "string" ? body[key] as string : "";

    if (action === "verify") {
      await verifyDeletionAnswer(user.uid, text("answer"));
      return json(200, { verified: true });
    }

    if (action === "setup") {
      await setupDeletionSecurity(user.uid, text("question"), text("answer"));
    } else if (action === "change") {
      await changeDeletionSecurity(user.uid, text("currentAnswer"), text("question"), text("answer"));
    } else {
      return json(400, { error: "Invalid settings action." });
    }

    const settings = await getDeletionSecurity(user.uid);
    return json(200, { saved: true, ...settings });
  } catch (error) {
    return securityErrorResponse(error);
  }
};