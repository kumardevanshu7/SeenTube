/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  readonly PUBLIC_FIREBASE_API_KEY: string;
  readonly PUBLIC_FIREBASE_AUTH_DOMAIN: string;
  readonly PUBLIC_FIREBASE_PROJECT_ID: string;
  readonly PUBLIC_FIREBASE_STORAGE_BUCKET: string;
  readonly PUBLIC_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly PUBLIC_FIREBASE_APP_ID: string;
  readonly PUBLIC_APP_URL?: string;
  readonly FIREBASE_ADMIN_PROJECT_ID?: string;
  readonly FIREBASE_ADMIN_CLIENT_EMAIL?: string;
  readonly FIREBASE_ADMIN_PRIVATE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
      createdAt: Date;
      updatedAt: Date;
      emailVerified: boolean;
    } | null;
    session: {
      id: string;
      userId: string;
      expiresAt: Date;
      token: string;
    } | null;
  }
}