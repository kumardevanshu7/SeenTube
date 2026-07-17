// Server-Sent Events (SSE) event emitter for real-time updates
// This module holds in-memory SSE clients for broadcasting status changes

type SSEClient = {
  id: string;
  userId: string;
  controller: ReadableStreamDefaultController;
};

// Global client registry (persists across requests in Node standalone)
const clients = new Map<string, SSEClient>();

export function addSSEClient(client: SSEClient) {
  clients.set(client.id, client);
}

export function removeSSEClient(id: string) {
  clients.delete(id);
}

export type SSEEvent = {
  type: "status_update" | "video_added" | "video_deleted";
  payload: {
    videoId?: string;
    userId?: string;
    userName?: string;
    userAvatar?: string;
    status?: string;
    video?: unknown;
  };
};

export function broadcastSSE(event: SSEEvent, excludeUserId?: string) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  const encoder = new TextEncoder();

  for (const [id, client] of clients) {
    if (excludeUserId && client.userId === excludeUserId) continue;
    try {
      client.controller.enqueue(encoder.encode(data));
    } catch {
      // Client disconnected
      clients.delete(id);
    }
  }
}

export function getClientCount() {
  return clients.size;
}
