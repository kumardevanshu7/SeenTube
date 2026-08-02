import { promisify } from "node:util";
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";

const scrypt = promisify(nodeScrypt);
const COLLECTION = "deletionCredentials";
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;
const MAX_ANSWER_LENGTH = 256;

type CredentialRecord = {
  version: number;
  answerHash: string;
  answerSalt: string;
  securityQuestion: string;
  failureCount?: number;
  lockUntil?: number;
  createdAt: number;
  updatedAt: number;
};

export type DeletionSecurityCode =
  | "NOT_CONFIGURED"
  | "ALREADY_CONFIGURED"
  | "INVALID_ANSWER"
  | "LOCKED";

export class DeletionSecurityError extends Error {
  code: DeletionSecurityCode;
  constructor(code: DeletionSecurityCode, message: string) {
    super(message);
    this.code = code;
  }
}

export class FirebaseAdminConfigurationError extends Error {
  constructor() {
    super("Firebase Admin is not configured. Add the three FIREBASE_ADMIN_* variables to .env and restart the dev server.");
  }
}

const getAdminConfig = () => ({
  projectId: import.meta.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: import.meta.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: import.meta.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
});

export const isFirebaseAdminConfigured = () => {
  const config = getAdminConfig();
  return Boolean(config.projectId && config.clientEmail && config.privateKey);
};

export const getAdminApp = () => {
  const { projectId, clientEmail, privateKey } = getAdminConfig();
  if (!projectId || !clientEmail || !privateKey) throw new FirebaseAdminConfigurationError();
  return getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
};

export const getAdminDb = () => getFirestore(getAdminApp());

export async function authenticateRequest(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("UNAUTHENTICATED");
  return getAuth(getAdminApp()).verifyIdToken(authorization.slice(7), true);
}

/**
 * CSRF guard that works behind Vercel/proxies.
 * Browsers send Origin on POSTs; comparing only to `request.url` breaks when
 * the runtime URL host differs from the public Host / x-forwarded-host.
 */
export function isTrustedBrowserOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  const candidates = new Set<string>();
  const push = (value: string | null | undefined) => {
    if (!value) return;
    const host = value.split(",")[0]?.trim().toLowerCase();
    if (host) candidates.add(host);
  };

  push(request.headers.get("x-forwarded-host"));
  push(request.headers.get("host"));
  try {
    push(new URL(request.url).host);
  } catch {
    // ignore malformed request URL
  }

  const siteUrl = import.meta.env.PUBLIC_SITE_URL || import.meta.env.SITE;
  if (typeof siteUrl === "string" && siteUrl) {
    try {
      push(new URL(siteUrl).host);
    } catch {
      // ignore
    }
  }

  if (candidates.has(originHost)) return true;

  // Treat www.example.com and example.com as the same site.
  const stripWww = (host: string) => host.replace(/^www\./, "");
  const originBare = stripWww(originHost);
  for (const candidate of candidates) {
    if (stripWww(candidate) === originBare) return true;
  }
  return false;
}


const normalizeAnswer = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();

const deriveHash = async (value: string, salt: string) =>
  Buffer.from(await scrypt(value, salt, 64) as ArrayBuffer).toString("base64");

const createHash = async (value: string) => {
  const salt = randomBytes(16).toString("base64");
  return { salt, hash: await deriveHash(value, salt) };
};

const hashesMatch = async (value: string, salt: string, expectedHash: string) => {
  const actual = Buffer.from(await deriveHash(value, salt), "base64");
  const expected = Buffer.from(expectedHash, "base64");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const credentialRef = (uid: string) => getAdminDb().collection(COLLECTION).doc(uid);

const validateQuestion = (question: string) => {
  const trimmed = question.trim();
  if (trimmed.length < 5 || trimmed.length > 160) throw new Error("Security question must be 5–160 characters.");
  return trimmed;
};

// The security answer has no fixed length: any non-empty answer is accepted.
// A generous upper bound only guards against abuse and is never shown to users.
const validateAnswer = (answer: string) => {
  const normalized = normalizeAnswer(answer);
  if (!normalized) throw new Error("Enter a security answer.");
  if (normalized.length > MAX_ANSWER_LENGTH) throw new Error("Security answer is too long.");
  return normalized;
};

async function recordFailure(ref: DocumentReference) {
  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current = Number(snapshot.get("failureCount") || 0) + 1;
    transaction.update(ref, current >= MAX_FAILURES
      ? { failureCount: 0, lockUntil: Date.now() + LOCK_MS, updatedAt: Date.now() }
      : { failureCount: current, updatedAt: Date.now() });
  });
}

async function clearFailures(ref: DocumentReference) {
  await ref.set({ failureCount: 0, lockUntil: 0, updatedAt: Date.now() }, { merge: true });
}

export async function getDeletionSecurity(uid: string) {
  const snapshot = await credentialRef(uid).get();
  if (!snapshot.exists) return { configured: false, securityQuestion: "" };
  const question = snapshot.data()?.securityQuestion;
  return { configured: true, securityQuestion: typeof question === "string" ? question : "" };
}

// Verifies the security answer. Used both for deletion and for changing credentials.
export async function verifyDeletionAnswer(uid: string, answer: string) {
  const ref = credentialRef(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new DeletionSecurityError("NOT_CONFIGURED", "Set your security question in Settings first.");

  const data = snapshot.data() as CredentialRecord;
  const lockUntil = Number(data.lockUntil) || 0;
  if (lockUntil > Date.now()) throw new DeletionSecurityError("LOCKED", "Too many incorrect answers. Try again in 10 minutes.");

  const normalized = normalizeAnswer(answer);
  const valid = Boolean(normalized && data.answerSalt && data.answerHash)
    && await hashesMatch(normalized, data.answerSalt, data.answerHash);
  if (!valid) {
    await recordFailure(ref);
    throw new DeletionSecurityError("INVALID_ANSWER", "Incorrect security answer.");
  }
  await clearFailures(ref);
}

export async function setupDeletionSecurity(uid: string, question: string, answer: string) {
  const trimmedQuestion = validateQuestion(question);
  const normalizedAnswer = validateAnswer(answer);
  const answerResult = await createHash(normalizedAnswer);
  const now = Date.now();
  await getAdminDb().runTransaction(async (transaction) => {
    const ref = credentialRef(uid);
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) throw new DeletionSecurityError("ALREADY_CONFIGURED", "Deletion security is already configured.");
    transaction.set(ref, {
      version: 2,
      answerHash: answerResult.hash,
      answerSalt: answerResult.salt,
      securityQuestion: trimmedQuestion,
      failureCount: 0,
      lockUntil: 0,
      createdAt: now,
      updatedAt: now,
    } satisfies CredentialRecord);
  });
}

// Changing the question/answer requires answering the current question correctly.
export async function changeDeletionSecurity(
  uid: string,
  currentAnswer: string,
  question: string,
  answer: string,
) {
  await verifyDeletionAnswer(uid, currentAnswer);
  const trimmedQuestion = validateQuestion(question);
  const normalizedAnswer = validateAnswer(answer);
  const answerResult = await createHash(normalizedAnswer);
  await credentialRef(uid).set({
    version: 2,
    answerHash: answerResult.hash,
    answerSalt: answerResult.salt,
    securityQuestion: trimmedQuestion,
    failureCount: 0,
    lockUntil: 0,
    updatedAt: Date.now(),
  }, { merge: true });
}
