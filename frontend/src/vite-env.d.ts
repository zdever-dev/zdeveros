// frontend/src/vite-env.d.ts
/// <reference types="vite/client" />

// Zajistí že TypeScript rozumí CSS importům
declare module '*.css' {
  const content: string;
  export default content;
}