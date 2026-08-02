import { auth } from "@/lib/firebase";

export type ProtectedResourceType = "roadmap" | "video";

type DeleteResponse = { error?: string };
type SecurityResponse = {
  configured?: boolean;
  serverConfigured?: boolean;
  securityQuestion?: string;
  error?: string;
};

export type DeletionQuestion = {
  configured: boolean;
  serverConfigured: boolean;
  securityQuestion: string;
};

export async function getDeletionQuestion(): Promise<DeletionQuestion> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");

  const token = await user.getIdToken();
  const response = await fetch("/api/deletion-security", {
    method: "GET",
    headers: { "Authorization": `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({})) as SecurityResponse;
  if (!response.ok) throw new Error(result.error || "Could not load your security question.");
  return {
    configured: Boolean(result.configured),
    serverConfigured: result.serverConfigured !== false,
    securityQuestion: result.securityQuestion || "",
  };
}

// Verifies the user's security answer without performing any deletion.
// Used to gate sensitive owner actions such as reordering roadmap videos.
export async function verifyDeletionAnswer(answer: string) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");

  const token = await user.getIdToken();
  const response = await fetch("/api/deletion-security", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "verify", answer }),
  });
  const result = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(result.error || "Could not verify your security answer.");
}

export async function deleteProtectedResource(
  resourceType: ProtectedResourceType,
  resourceId: string,
  answer: string,
) {
  await deleteProtectedResources(resourceType, [resourceId], answer);
}

export async function deleteProtectedResources(
  resourceType: ProtectedResourceType,
  resourceIds: string[],
  answer: string,
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again before deleting.");
  const ids = resourceIds.filter((id) => typeof id === "string" && id && !id.includes("/"));
  if (ids.length === 0) throw new Error("Nothing selected to delete.");

  const token = await user.getIdToken();
  const response = await fetch("/api/delete-resource", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      resourceType,
      resourceId: ids[0],
      resourceIds: ids,
      answer,
    }),
  });
  const result = await response.json().catch(() => ({})) as DeleteResponse & { deletedIds?: string[] };
  if (!response.ok) {
    throw new Error(result.error || "Deletion could not be completed.");
  }
  return result.deletedIds || ids;
}
