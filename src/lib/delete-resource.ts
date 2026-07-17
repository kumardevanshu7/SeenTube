import { auth } from "@/lib/firebase";

export type ProtectedResourceType = "roadmap" | "video";

type DeleteResponse = { error?: string };

export async function deleteProtectedResource(
  resourceType: ProtectedResourceType,
  resourceId: string,
  password: string,
) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again before deleting.");

  const token = await user.getIdToken();
  const response = await fetch("/api/delete-resource", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ resourceType, resourceId, password }),
  });
  const result = await response.json().catch(() => ({})) as DeleteResponse;
  if (!response.ok) {
    throw new Error(result.error || "Deletion could not be completed.");
  }
}