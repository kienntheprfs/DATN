// src/app/page.tsx
'use client'; // Vì MapEditor dùng nhiều state/hook, nên đánh dấu là Client Component

import { MapEditorPage } from "@/features/editor/MapEditorPage";

export default function Home() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <MapEditorPage />
    </main>
  );
}