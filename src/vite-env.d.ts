/// <reference types="vite/client" />
// ✅ Task 4.1 — Proper TypeScript types for Vite's import.meta.env
// This removes the need for (import.meta as any).env hacks in App.tsx
interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
