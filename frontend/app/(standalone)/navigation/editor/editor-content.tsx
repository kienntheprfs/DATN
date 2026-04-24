"use client";

import { usePageTitle } from "@/hooks/use-page-title";
import EditorPage from "@/components/features/editor/EditorPage";

export default function EditorContent() {
	usePageTitle();
	return <EditorPage />;
}