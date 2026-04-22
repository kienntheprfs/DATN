"use client";

import React, { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RatingPagination } from "./RatingPagination";
import type { RatingRow } from "./Rating.types";
import { RatingTable } from "./RatingTable";
import type { RatingFilters } from "./RatingFilterPanel";
import type { AdminRatingItem, RatingValue } from "@/services/rating-api";
import { ratingService } from "@/services/rating-api";

const PAGE_SIZE = 10;

function toSentiment(value: RatingValue): "positive" | "negative" {
  return value === "LIKE" ? "positive" : "negative";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${hour}:${minute}`;
}

function toPreview(content: string): string {
  return content.length > 160 ? `${content.slice(0, 160)}...` : content;
}

function mapRow(item: AdminRatingItem): RatingRow {
  const createdAt = item.created_at;
  const threadName = item.thread_name?.trim() || "Không có tiêu đề";
  const userName = item.user_name?.trim() || item.user_id;

  return {
    id: item.id,
    userId: item.user_id,
    userName,
    runId: item.run_id,
    threadId: item.thread_id,
    threadName,
    agentId: item.agent_id,
    sessionId: item.thread_id,
    sessionUuid: item.thread_id,
    pair: 1,
    date: formatDate(createdAt),
    time: formatTime(createdAt),
    question: toPreview(item.question),
    questionFull: item.question,
    answer: toPreview(item.answer),
    answerFull: item.answer,
    sentiment: toSentiment(item.rating),
    comment: item.comment ?? "",
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

type RatingDataPanelProps = {
  filters: RatingFilters;
  onOpenDetail: (row: RatingRow) => void;
};

export function RatingDataPanel({ filters, onOpenDetail }: RatingDataPanelProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ["admin-ratings", filters, currentPage],
    queryFn: () =>
      ratingService.listAdminRatings({
        page: currentPage,
        page_size: PAGE_SIZE,
        search: filters.search.trim() || undefined,
        rating:
          filters.rating === "all"
            ? undefined
            : filters.rating === "positive"
              ? "LIKE"
              : "DISLIKE",
        from_date: filters.fromDate || undefined,
        to_date: filters.toDate || undefined,
          sort_by: filters.sortBy,
      }),
    placeholderData: keepPreviousData,
  });

  const rows = useMemo(() => {
      return (listQuery.data?.items ?? []).map(mapRow);
    }, [listQuery.data]);

  const totalItems = listQuery.data?.total_items ?? 0;
  const totalPages = Math.max(1, listQuery.data?.total_pages ?? 0);

  return (
    <div className="bg-surface rounded-md border border-border-color shadow-sm flex-1 flex flex-col overflow-hidden">
      {listQuery.isError && (
        <div className="mx-4 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Không thể tải dữ liệu đánh giá. Vui lòng thử lại.
          <button
            type="button"
            onClick={() => {
              toast.info("Đang tải lại danh sách đánh giá...");
              listQuery.refetch();
            }}
            className="ml-3 font-semibold underline decoration-red-400 underline-offset-2"
          >
            Tải lại
          </button>
        </div>
      )}

      <RatingTable
        rows={rows}
        onOpenDetail={onOpenDetail}
        isLoading={listQuery.isLoading || listQuery.isFetching}
      />
      <RatingPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
