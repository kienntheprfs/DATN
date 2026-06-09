"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { RatingDataPanel } from "@/components/admin/rating/RatingDataPanel";
import { RatingDetailModal } from "@/components/admin/rating/RatingDetailModal";
import { RatingFilterPanel, RatingFilters } from "@/components/admin/rating/RatingFilterPanel";
import { RatingStats } from "@/components/admin/rating/RatingStats";
import type { RatingRow } from "@/components/admin/rating/Rating.types";

function toInputDate(value: Date): string {
	return value.toISOString().slice(0, 10);
}

export default function RatingPage() {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						refetchOnWindowFocus: false,
						refetchOnReconnect: false,
						refetchOnMount: false,
						staleTime: 5 * 60 * 1000,
						gcTime: 30 * 60 * 1000,
					},
				},
			}),
	);
	const initialFilters = useMemo<RatingFilters>(() => {
		const now = new Date();
		const oneMonthAgo = new Date(now);
		oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

		return {
			fromDate: toInputDate(oneMonthAgo),
			toDate: toInputDate(now),
			search: "",
			rating: "all",
			sortBy: "created_desc",
		};
	}, []);

	const [draftFilters, setDraftFilters] = useState<RatingFilters>(initialFilters);
	const debouncedFilters = useDeferredValue(draftFilters);
	const filterKey = useMemo(
		() => `${debouncedFilters.fromDate}|${debouncedFilters.toDate}|${debouncedFilters.search}|${debouncedFilters.rating}|${debouncedFilters.sortBy}`,
		[debouncedFilters],
	);
	const [selectedRow, setSelectedRow] = useState<RatingRow | null>(null);

	return (
		<QueryClientProvider client={queryClient}>
			<>
				<div className="max-w-400 mx-auto w-full flex flex-col md:h-full">
					<div className="flex flex-col gap-6 mb-6 shrink-0">
						<div className="flex items-center justify-between">
							<div>
								<h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">Bình luận của người dùng</h1>
								<p className="text-sm text-text-secondary mt-1">Theo dõi và quản lý phản hồi, đánh giá từ sinh viên và giảng viên.</p>
							</div>
						</div>
					</div>

					<RatingStats filters={debouncedFilters} />

					<RatingFilterPanel
						filters={draftFilters}
						onFiltersChange={setDraftFilters}
						onExport={() => {
							toast.info("Export Excel sẽ được kết nối ở bước tiếp theo.");
						}}
						onPrint={() => {
							window.print();
						}}
					/>

					<RatingDataPanel key={filterKey} filters={debouncedFilters} onOpenDetail={setSelectedRow} />
				</div>

				<RatingDetailModal row={selectedRow} onClose={() => setSelectedRow(null)} />
			</>
		</QueryClientProvider>
	);
}
