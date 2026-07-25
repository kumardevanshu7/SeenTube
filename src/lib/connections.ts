import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  where,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ConnectionStatus = "pending" | "accepted";

export interface Connection {
  participants: [string, string];
  requesterId: string;
  recipientId: string;
  status: ConnectionStatus;
  createdAt: number;
  updatedAt: number;
}

function requireUid(uid: string, role: string) {
  const value = uid.trim();
  if (!value) throw new Error(`${role} is required.`);
  if (value.includes("/")) throw new Error(`${role} is invalid.`);
  return value;
}

export function getConnectionPairId(uidA: string, uidB: string) {
  const first = requireUid(uidA, "User ID");
  const second = requireUid(uidB, "User ID");
  if (first === second) throw new Error("You cannot connect with yourself.");
  return [first, second].sort((a, b) => a.localeCompare(b)).join("__");
}

export function getConnectionRef(
  uidA: string,
  uidB: string,
): DocumentReference {
  return doc(db, "connections", getConnectionPairId(uidA, uidB));
}

export async function sendConnectionRequest(requesterId: string, recipientId: string) {
  const requester = requireUid(requesterId, "Requester ID");
  const recipient = requireUid(recipientId, "Recipient ID");
  const connectionRef = getConnectionRef(requester, recipient);
  const now = Date.now();
  const participants = [requester, recipient]
    .sort((a, b) => a.localeCompare(b)) as [string, string];

  // Do not read first: secure participant-based rules cannot authorize a read
  // of a connection document that does not exist yet. A deterministic set is
  // classified as create for a new pair and update for an existing pair, so
  // the rules remain the race-safe authority against duplicates/overwrites.
  await setDoc(connectionRef, {
    participants,
    requesterId: requester,
    recipientId: recipient,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  } satisfies Connection);

  return connectionRef.id;
}
export async function respondToConnectionRequest(
  connectionId: string,
  recipientId: string,
  accept: boolean,
) {
  const id = requireUid(connectionId, "Connection ID");
  const recipient = requireUid(recipientId, "Recipient ID");
  const connectionRef = doc(db, "connections", id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(connectionRef);
    if (!snapshot.exists()) throw new Error("Connection request no longer exists.");

    const connection = snapshot.data() as Partial<Connection>;
    if (connection.status !== "pending") throw new Error("This request is no longer pending.");
    if (connection.recipientId !== recipient) throw new Error("Only the recipient can respond to this request.");
    if (!connection.participants?.includes(recipient)) throw new Error("The recipient is not part of this connection.");

    if (accept) {
      transaction.update(connectionRef, {
        status: "accepted" satisfies ConnectionStatus,
        updatedAt: Date.now(),
      });
    } else {
      transaction.delete(connectionRef);
    }
  });
}

export async function removeConnection(connectionId: string, currentUid: string) {
  const id = requireUid(connectionId, "Connection ID");
  const uid = requireUid(currentUid, "Current user ID");
  const connectionRef = doc(db, "connections", id);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(connectionRef);
    if (!snapshot.exists()) throw new Error("Connection no longer exists.");

    const connection = snapshot.data() as Partial<Connection>;
    if (!connection.participants?.includes(uid)) throw new Error("You are not part of this connection.");
    if (connection.status === "pending" && connection.requesterId !== uid) {
      throw new Error("Only the requester can cancel a pending request.");
    }
    if (connection.status !== "pending" && connection.status !== "accepted") {
      throw new Error("This connection is in an invalid state.");
    }

    transaction.delete(connectionRef);
  });
}

export type ConnectionDocument = QueryDocumentSnapshot<DocumentData>;

function mergeConnectionDocuments(...groups: ConnectionDocument[][]) {
  const merged = new Map<string, ConnectionDocument>();
  groups.flat().forEach((connectionDocument) => {
    merged.set(connectionDocument.id, connectionDocument);
  });
  return Array.from(merged.values());
}

export async function getUserConnectionDocuments(uid: string) {
  const userId = requireUid(uid, "User ID");
  const connectionsRef = collection(db, "connections");
  const [requested, received] = await Promise.all([
    getDocs(query(connectionsRef, where("requesterId", "==", userId))),
    getDocs(query(connectionsRef, where("recipientId", "==", userId))),
  ]);
  return mergeConnectionDocuments(requested.docs, received.docs);
}

export function subscribeToUserConnectionDocuments(
  uid: string,
  onNext: (documents: ConnectionDocument[]) => void,
  onError: (error: Error) => void,
) {
  const userId = requireUid(uid, "User ID");
  const connectionsRef = collection(db, "connections");
  let requested: ConnectionDocument[] | null = null;
  let received: ConnectionDocument[] | null = null;

  const publish = () => {
    if (!requested || !received) return;
    onNext(mergeConnectionDocuments(requested, received));
  };

  const unsubscribeRequested = onSnapshot(
    query(connectionsRef, where("requesterId", "==", userId)),
    (snapshot) => {
      requested = snapshot.docs;
      publish();
    },
    onError,
  );
  const unsubscribeReceived = onSnapshot(
    query(connectionsRef, where("recipientId", "==", userId)),
    (snapshot) => {
      received = snapshot.docs;
      publish();
    },
    onError,
  );

  return () => {
    unsubscribeRequested();
    unsubscribeReceived();
  };
}