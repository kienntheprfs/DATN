"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DeletePinModal } from "./DeletePinModal";
import { PinnedPostListView } from "./PinnedPostListView";
import type { PinnedCategory, PinnedPost, PinnedPostStats, PinnedSortMode } from "./PinnedPostTypes";
import { pinnedPostService } from "@/services/pinned-post-api";

const ITEMS_PER_PAGE = 4;

function formatDate(value: string | null): string {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function mapPost(item: Awaited<ReturnType<typeof pinnedPostService.listAdmin>>["items"][number]): PinnedPost {
  return {
    id: item.id,
    order: item.order,
    title: item.title,
    refId: item.ref_id,
    category: item.category,
    pinnedDate: item.pinned_date,
    summary: item.summary,
    sourceUrl: item.source_url,
    documentType: item.document_type,
    tags: item.tags,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapStats(stats: Awaited<ReturnType<typeof pinnedPostService.listAdmin>>["stats"] | undefined): PinnedPostStats {
  return {
    totalPins: stats?.total_pins ?? 0,
    activeSlots: stats?.active_slots ?? 0,
    maxSlots: stats?.max_slots ?? 10,
    topCategory: stats?.top_category ?? null,
    lastUpdatedDate: stats?.last_updated_date ?? null,
  };
}

function formatRelativeDate(value: string | null): string {
  if (!value) {
    return "NO UPDATES";
  }

  const target = new Date(value);
  if (Number.isNaN(target.getTime())) {
    return "NO UPDATES";
  }

  const diffMs = Date.now() - target.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) {
    return "UPDATED TODAY";
  }
  if (diffDays === 1) {
    return "UPDATED 1 DAY AGO";
  }
  return `UPDATED ${diffDays} DAYS AGO`;
}

interface PinnedPostDataPanelProps {
  onCreateNew: () => void;
  onEdit: (item: PinnedPost) => void;
  initialSortMode?: PinnedSortMode;
}

export function PinnedPostDataPanel({ onCreateNew, onEdit, initialSortMode = "latest" }: PinnedPostDataPanelProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<"all" | PinnedCategory>("all");
  const [sortMode, setSortMode] = useState<PinnedSortMode>(initialSortMode);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<PinnedPost | null>(null);
  const [draggingPostId, setDraggingPostId] = useState<string | null>(null);
  const [dragOverPostId, setDragOverPostId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<"before" | "after" | null>(null);

  const deferredFilters = useDeferredValue({ search, category, sortMode });

  const listQuery = useQuery({
    queryKey: ["admin-pinned-posts", deferredFilters, currentPage],
    queryFn: () =>
      pinnedPostService.listAdmin({
        page: currentPage,
        page_size: ITEMS_PER_PAGE,
        search: deferredFilters.search.trim() || undefined,
        category: deferredFilters.category === "all" ? undefined : deferredFilters.category,
        sort_by: deferredFilters.sortMode,
      }),
    placeholderData: keepPreviousData,
  });

  const manualAllQuery = useQuery({
    queryKey: ["admin-pinned-posts-manual-all"],
    queryFn: () =>
      pinnedPostService.listAdmin({
        page: 1,
        page_size: 100,
        sort_by: "manual",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (postId: string) => {
      await pinnedPostService.delete(postId);
    },
    onSuccess: () => {
      toast.success("Đã xóa bài ghim thành công.");
      setDeleteCandidate(null);
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts"] });
      setCurrentPage(1);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể xóa bài ghim. Vui lòng thử lại.";
      toast.error(message);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedPostIds: string[]) => {
      await pinnedPostService.reorder({ ordered_post_ids: orderedPostIds });
    },
    onSuccess: () => {
      toast.success("Đã cập nhật thứ tự bài ghim thành công.");
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts-manual-all"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể cập nhật thứ tự bài ghim.";
      toast.error(message);
    },
  });

  const items = useMemo(() => {
    return (listQuery.data?.items ?? []).map(mapPost);
  }, [listQuery.data]);

  const stats = mapStats(listQuery.data?.stats);
  const totalItems = listQuery.data?.total_items ?? 0;
  const totalPages = Math.max(1, listQuery.data?.total_pages ?? 0);
  const manualAllItems = useMemo(() => {
    return (manualAllQuery.data?.items ?? []).map(mapPost);
  }, [manualAllQuery.data]);

  const topCategoryCount = useMemo(() => {
    if (!stats.topCategory) {
      return 0;
    }
    return manualAllItems.filter((item) => item.category === stats.topCategory).length;
  }, [manualAllItems, stats.topCategory]);

  const topCategoryShareText = useMemo(() => {
    if (!stats.topCategory || stats.totalPins <= 0) {
      return "N/A";
    }
    const ratio = Math.round((topCategoryCount / stats.totalPins) * 100);
    return `${ratio}% OF ALL PINS`;
  }, [stats.topCategory, stats.totalPins, topCategoryCount]);

  const pageStartIndex = totalItems === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const pageEndIndex = totalItems === 0 ? 0 : pageStartIndex + items.length - 1;
  const canReorder = search.trim().length === 0 && category === "all";

  const handleDragStart = (item: PinnedPost) => {
    if (!canReorder || isLoading) {
      toast.info("Chỉ có thể đổi thứ tự khi không bật bộ lọc tìm kiếm hoặc danh mục.");
      return;
    }

    if (sortMode !== "manual") {
      setSortMode("manual");
      setCurrentPage(1);
      toast.info("Đã chuyển sang chế độ Manual. Vui lòng kéo lại để đổi thứ tự.");
      return;
    }

    setDraggingPostId(item.id);
    setDragOverPostId(null);
    setDragOverPosition(null);
  };

  const handleDragOverRow = (item: PinnedPost, position: "before" | "after") => {
    if (!canReorder || !draggingPostId || draggingPostId === item.id) {
      return;
    }
    setDragOverPostId(item.id);
    setDragOverPosition(position);
  };

  const handleDropRow = (item: PinnedPost, position: "before" | "after") => {
    if (!canReorder || !draggingPostId || draggingPostId === item.id) {
      setDraggingPostId(null);
      setDragOverPostId(null);
      setDragOverPosition(null);
      return;
    }

    const fromIndex = manualAllItems.findIndex((entry) => entry.id === draggingPostId);
    const toIndex = manualAllItems.findIndex((entry) => entry.id === item.id);

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingPostId(null);
      setDragOverPostId(null);
      setDragOverPosition(null);
      return;
    }

    const reordered = [...manualAllItems];
    const [moved] = reordered.splice(fromIndex, 1);
    const insertIndex = position === "before" ? toIndex : toIndex + 1;
    const boundedInsertIndex = Math.max(0, Math.min(insertIndex, reordered.length));
    reordered.splice(boundedInsertIndex, 0, moved);

    reorderMutation.mutate(reordered.map((entry) => entry.id));
    setDraggingPostId(null);
    setDragOverPostId(null);
    setDragOverPosition(null);
  };

  const handleDragEnd = () => {
    setDraggingPostId(null);
    setDragOverPostId(null);
    setDragOverPosition(null);
  };

  const isLoading = listQuery.isLoading || listQuery.isFetching;

  return (
    <>
      <PinnedPostListView
        items={items}
        overallTotalPins={stats.totalPins}
        totalItems={totalItems}
        pageStartIndex={pageStartIndex}
        pageEndIndex={pageEndIndex}
        activeSlots={stats.activeSlots}
        maxSlots={stats.maxSlots}
        activeSlotsText={`${stats.activeSlots}/${stats.maxSlots}`}
        topCategoryText={stats.topCategory ?? "N/A"}
        topCategoryShareText={topCategoryShareText}
        lastUpdateText={formatDate(stats.lastUpdatedDate)}
        lastUpdateRelativeText={formatRelativeDate(stats.lastUpdatedDate)}
        isLoading={isLoading}
        isError={listQuery.isError}
        search={search}
        category={category}
        sortMode={sortMode}
        currentPage={currentPage}
        totalPages={totalPages}
        onSearchChange={(value) => {
          setSearch(value);
          setCurrentPage(1);
        }}
        onCategoryChange={(value) => {
          setCategory(value);
          setCurrentPage(1);
        }}
        onSortChange={(value) => {
          setSortMode(value);
          setCurrentPage(1);
        }}
        onPrevPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
        onNextPage={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        onAddNewPin={onCreateNew}
        onEditPin={onEdit}
        onRequestDelete={setDeleteCandidate}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOverRow={handleDragOverRow}
        onDropRow={handleDropRow}
        draggingItemId={draggingPostId}
        dragOverItemId={dragOverPostId}
        dragOverPosition={dragOverPosition}
        canReorder={canReorder}
        isReordering={reorderMutation.isPending}
        onRetry={() => {
          toast.info("Đang tải lại danh sách bài ghim...");
          listQuery.refetch();
        }}
      />

      <DeletePinModal
        open={Boolean(deleteCandidate)}
        pinTitle={deleteCandidate?.title}
        isDeleting={deleteMutation.isPending}
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setDeleteCandidate(null);
          }
        }}
        onConfirm={() => {
          if (deleteCandidate) {
            deleteMutation.mutate(deleteCandidate.id);
          }
        }}
      />
    </>
  );
}
