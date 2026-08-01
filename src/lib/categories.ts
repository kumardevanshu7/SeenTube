import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CATEGORIES } from "@/lib/constants";

export type UserCategoryPrefs = {
  customCategories: string[];
  removedCategories: string[];
};

const EMPTY_PREFS: UserCategoryPrefs = {
  customCategories: [],
  removedCategories: [],
};

export function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function resolveCategories(prefs?: Partial<UserCategoryPrefs> | null): string[] {
  const removed = new Set(
    (prefs?.removedCategories || []).map((name) => normalizeCategoryName(name)),
  );
  const builtIn = CATEGORIES.filter((name) => !removed.has(name));
  const builtInSet = new Set<string>(builtIn);
  const custom = (prefs?.customCategories || [])
    .map((name) => normalizeCategoryName(name))
    .filter((name) => name.length > 0 && !builtInSet.has(name) && !removed.has(name));

  // Deduplicate custom while preserving order
  const seen = new Set<string>();
  const uniqueCustom: string[] = [];
  for (const name of custom) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCustom.push(name);
  }

  return [...builtIn, ...uniqueCustom];
}

export function parseCategoryPrefs(data: Record<string, unknown> | undefined | null): UserCategoryPrefs {
  if (!data) return { ...EMPTY_PREFS };
  const custom = Array.isArray(data.customCategories)
    ? data.customCategories.filter((item): item is string => typeof item === "string")
    : [];
  const removed = Array.isArray(data.removedCategories)
    ? data.removedCategories.filter((item): item is string => typeof item === "string")
    : [];
  return {
    customCategories: custom.map(normalizeCategoryName).filter(Boolean),
    removedCategories: removed.map(normalizeCategoryName).filter(Boolean),
  };
}

export async function getUserCategoryPrefs(userId: string): Promise<UserCategoryPrefs> {
  const snapshot = await getDoc(doc(db, "users", userId));
  return parseCategoryPrefs(snapshot.data() as Record<string, unknown> | undefined);
}

export async function saveUserCategoryPrefs(userId: string, prefs: UserCategoryPrefs) {
  const customCategories = prefs.customCategories
    .map(normalizeCategoryName)
    .filter(Boolean);
  const removedCategories = prefs.removedCategories
    .map(normalizeCategoryName)
    .filter((name) => (CATEGORIES as readonly string[]).includes(name));

  await setDoc(
    doc(db, "users", userId),
    { customCategories, removedCategories, updatedAt: Date.now() },
    { merge: true },
  );

  return { customCategories, removedCategories };
}

export function isBuiltInCategory(name: string) {
  return (CATEGORIES as readonly string[]).includes(normalizeCategoryName(name));
}
