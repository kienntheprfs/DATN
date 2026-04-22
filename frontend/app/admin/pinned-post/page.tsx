"use client";

import React, { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PinnedPostDataPanel } from "@/components/admin/pinnedPost/PinnedPostDataPanel";
import { PinnedPostEditorPanel } from "@/components/admin/pinnedPost/PinnedPostEditorPanel";
import type { PinnedPost } from "@/components/admin/pinnedPost/PinnedPostTypes";

type PageMode = "list" | "create";

export default function PinnedPostPage() {
	const [queryClient] = useState(() => new QueryClient());
	const [mode, setMode] = useState<PageMode>("list");
	const [editingPost, setEditingPost] = useState<PinnedPost | null>(null);

	return (
		<QueryClientProvider client={queryClient}>
			<div className="-m-4 flex min-h-[calc(100vh-60px)] flex-col overflow-auto bg-background-light px-4 py-5 md:-m-6 md:px-8 md:py-6">
				{mode === "list" ? (
					<PinnedPostDataPanel
						initialSortMode="manual"
						onCreateNew={() => {
							setEditingPost(null);
							setMode("create");
						}}
						onEdit={(item) => {
							setEditingPost(item);
							setMode("create");
						}}
					/>
				) : (
					<PinnedPostEditorPanel
						key={editingPost?.id ?? "new-pinned-post"}
						editingPost={editingPost}
						onSaved={() => {
							setEditingPost(null);
							setMode("list");
						}}
						onCancel={() => {
							setEditingPost(null);
							setMode("list");
						}}
					/>
				)}
			</div>
		</QueryClientProvider>
	);
}
