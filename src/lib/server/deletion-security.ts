import { promisify } from "node:util";
import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from "node:crypto";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";

const scrypt = promisify(nodeScrypt);
const COLLECTION = "deletionCredentials";
const MAX_FAILURES = 5;
const LOCK_MS = 10 * 60 * 1000;

type CredentialRecord = {
  version: number;
  passwordHash: string;
  passwordSalt: string;
  answerHash: string;
  answerSalt: string;
  securityQuestion: string;
  deleteFailureCount?: number;
  deleteLockUntil?: number;
  answerFailureCount?: number;
  answerLockUntil?: number;
  createdAt: number;
  updatedAt: number;
};

export type DeletionSecurityCode =
  | "NOT_CONFIGURED"
  | "ALREADY_CONFIGURED"
  | "INVALID_PASSWORD"
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

const validatePassword = (password: string) => {
  if (password.length < 8 || password.length > 128) throw new Error("Password must be 8–128 characters.");
};

const validateQuestionAndAnswer = (question: string, answer: string) => {
  if (question.trim().length < 5 || question.trim().length > 160) throw new Error("Security question must be 5–160 characters.");
  const normalized = normalizeAnswer(answer);
  if (normalized.length < 2 || normalized.length > 128) throw new Error("Security answer must be 2–128 characters.");
  return normalized;
};

async function recordFailure(ref: DocumentReference, kind: "delete" | "answer") {
  const countField = kind === "delete" ? "deleteFailureCount" : "answerFailureCount";
  const lockField = kind === "delete" ? "deleteLockUntil" : "answerLockUntil";
  await getAdminDb().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return;
    const current = Number(snapshot.get(countField) || 0) + 1;
    transaction.update(ref, current >= MAX_FAILURES
      ? { [countField]: 0, [lockField]: Date.now() + LOCK_MS, updatedAt: Date.now() }
      : { [countField]: current, updatedAt: Date.now() });
  });
}

async function clearFailures(ref: DocumentReference, kind: "delete" | "answer") {
  const countField = kind === "delete" ? "deleteFailureCount" : "answerFailureCount";
  const lockField = kind === "delete" ? "deleteLockUntil" : "answerLockUntil";
  await ref.set({ [countField]: 0, [lockField]: 0, updatedAt: Date.now() }, { merge: true });
}

async function verifyStoredSecret(uid: string, value: string, kind: "delete" | "answer") {
  const ref = credentialRef(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new DeletionSecurityError("NOT_CONFIGURED", "Set your deletion password in Settings first.");
  const data = snapshot.data() as CredentialRecord;
  const lockUntil = Number(kind === "delete" ? data.deleteLockUntil : data.answerLockUntil) || 0;
  if (lockUntil > Date.now()) throw new DeletionSecurityError("LOCKED", "Too many incorrect attempts. Try again in 10 minutes.");

  const normalized = kind === "answer" ? normalizeAnswer(value) : value;
  const salt = kind === "delete" ? data.passwordSalt : data.answerSalt;
  const hash = kind === "delete" ? data.passwordHash : data.answerHash;
  const valid = Boolean(normalized && salt && hash) && await hashesMatch(normalized, salt, hash);
  if (!valid) {
    await recordFailure(ref, kind);
    throw new DeletionSecurityError(kind === "delete" ? "INVALID_PASSWORD" : "INVALID_ANSWER", kind === "delete" ? "Incorrect deletion password." : "Incorrect security answer.");
  }
  await clearFailures(ref, kind);
  return data;
}

export async function getDeletionSecurity(uid: string) {
  const snapshot = await credentialRef(uid).get();
  if (!snapshot.exists) return { configured: false, securityQuestion: "" };
  const question = snapshot.data()?.securityQuestion;
  return { configured: true, securityQuestion: typeof question === "string" ? question : "" };
}

export async function verifyDeletionPassword(uid: string, password: string) {
  if (!password || password.length > 128) throw new DeletionSecurityError("INVALID_PASSWORD", "Incorrect deletion password.");
  await verifyStoredSecret(uid, password, "delete");
}
export async function setupDeletionSecurity(uid: string, password: string, question: string, answer: string) {
  validatePassword(password);
  const normalizedAnswer = validateQuestionAndAnswer(question, answer);
  const [passwordResult, answerResult] = await Promise.all([
    createHash(password),
    createHash(normalizedAnswer),
  ]);
  const now = Date.now();
  await getAdminDb().runTransaction(async (transaction) => {
    const ref = credentialRef(uid);
    const snapshot = await transaction.get(ref);
    if (snapshot.exists) throw new DeletionSecurityError("ALREADY_CONFIGURED", "Deletion security is already configured.");
    transaction.set(ref, {
      version: 1,
      passwordHash: passwordResult.hash,
      passwordSalt: passwordResult.salt,
      answerHash: answerResult.hash,
      answerSalt: answerResult.salt,
      securityQuestion: question.trim(),
      deleteFailureCount: 0,
      deleteLockUntil: 0,
      answerFailureCount: 0,
      answerLockUntil: 0,
      createdAt: now,
      updatedAt: now,
    } satisfies CredentialRecord);
  });
}

export async function changeDeletionSecurity(
  uid: string,
  currentPassword: string,
  newPassword: string,
  question: string,
  answer: string,
) {
  await verifyDeletionPassword(uid, currentPassword);
  validatePassword(newPassword);
  const normalizedAnswer = validateQuestionAndAnswer(question, answer);
  const [passwordResult, answerResult] = await Promise.all([
    createHash(newPassword),
    createHash(normalizedAnswer),
  ]);
  await credentialRef(uid).set({
    version: 1,
    passwordHash: passwordResult.hash,
    passwordSalt: passwordResult.salt,
    answerHash: answerResult.hash,
    answerSalt: answerResult.salt,
    securityQuestion: question.trim(),
    deleteFailureCount: 0,
    deleteLockUntil: 0,
    answerFailureCount: 0,
    answerLockUntil: 0,
    updatedAt: Date.now(),
  }, { merge: true });
}

export async function resetDeletionPassword(uid: string, answer: string, newPassword: string) {
  await verifyStoredSecret(uid, answer, "answer");
  validatePassword(newPassword);
  const passwordResult = await createHash(newPassword);
  await credentialRef(uid).set({
    passwordHash: passwordResult.hash,
    passwordSalt: passwordResult.salt,
    deleteFailureCount: 0,
    deleteLockUntil: 0,
    updatedAt: Date.now(),
  }, { merge: true });
}