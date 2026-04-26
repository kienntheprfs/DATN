"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ItemGroup } from "@/components/ui/item";
import { PinnedPostCard } from "./PinnedPostCard";
import { SortDropdown } from "./SortDropdown";
import { pinnedPostService } from "@/services/pinned-post-api";

type SortValue = "priority" | "newest" | "oldest" | "title-asc" | "title-desc";

interface PinnedPostCardItem {
  id: string;
  order: number;
  category: string;
  title: string;
  description: string;
  date: string;
  pinnedDateRaw: string;
  link?: string;
}

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Quy chế Đào tạo": {
    bg: "bg-blue-50",
    border: "border-blue-100",
    text: "text-[#030391]",
  },
  "Sau Đại học": {
    bg: "bg-emerald-50",
    border: "border-emerald-100",
    text: "text-emerald-700",
  },
  "Công tác Sinh viên": {
    bg: "bg-orange-50",
    border: "border-orange-100",
    text: "text-orange-700",
  },
  "Nghiên cứu Khoa học": {
    bg: "bg-slate-100",
    border: "border-slate-200",
    text: "text-slate-700",
  },
};

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

function mapToCardItem(item: Awaited<ReturnType<typeof pinnedPostService.listPublic>>["items"][number]): PinnedPostCardItem {
  return {
    id: item.id,
    order: item.order,
    category: item.category,
    title: item.title,
    description: item.summary,
    date: formatDate(item.pinned_date),
    pinnedDateRaw: item.pinned_date,
    link: item.source_url,
  };
}

export function PinnedPostListPanel() {
  const [sortBy, setSortBy] = useState<SortValue>("priority");
  const deferredSortBy = useDeferredValue(sortBy);

  const postsQuery = useQuery({
    queryKey: ["public-pinned-posts"],
    queryFn: () => pinnedPostService.listPublic({ limit: 100, sort_by: "latest" }),
  });

  const sortedPosts = useMemo(() => {
    const posts = (postsQuery.data?.items ?? []).map(mapToCardItem);

    switch (deferredSortBy) {
      case "priority":
        return posts.sort((a, b) => a.order - b.order);
      case "newest":
        return posts.sort((a, b) => {
          const aTime = new Date(a.pinnedDateRaw).getTime();
          const bTime = new Date(b.pinnedDateRaw).getTime();
          return bTime - aTime;
        });
      case "oldest":
        return posts.sort((a, b) => {
          const aTime = new Date(a.pinnedDateRaw).getTime();
          const bTime = new Date(b.pinnedDateRaw).getTime();
          return aTime - bTime;
        });
      case "title-asc":
        return posts.sort((a, b) => a.title.localeCompare(b.title, "vi"));
      case "title-desc":
        return posts.sort((a, b) => b.title.localeCompare(a.title, "vi"));
      default:
        return posts;
    }
  }, [postsQuery.data, deferredSortBy]);

  return (
    <>
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-6">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight mb-2">
            Thông tin phổ biến được cập nhật thường xuyên
          </h1>
          <p className="text-sm text-muted-foreground">
            Danh sách các quy định và thông báo quan trọng được đính kèm cố định trong hệ thống Nexus.
          </p>
        </div>

        <div className="flex items-end gap-6 w-full md:w-auto">
          <SortDropdown value={sortBy} onChange={(val) => setSortBy(val as SortValue)} />
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono">
              {sortedPosts.length} Records
            </p>
          </div>
        </div>
      </div>

      {postsQuery.isError ? (
        <div className="mb-6 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Không thể tải danh sách bài ghim. Vui lòng thử lại.
          <button
            type="button"
            onClick={() => {
              toast.info("Đang tải lại danh sách bài ghim...");
              postsQuery.refetch();
            }}
            className="ml-3 font-semibold underline decoration-red-400 underline-offset-2"
          >
            Tải lại
          </button>
        </div>
      ) : null}

      {postsQuery.isLoading || postsQuery.isFetching ? (
        <div className="flex flex-col border border-border bg-card shadow-sm rounded overflow-hidden">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="border-b border-border p-6 last:border-b-0 animate-pulse">
              <div className="h-5 w-28 rounded bg-slate-200" />
              <div className="mt-3 h-6 w-3/4 rounded bg-slate-200" />
              <div className="mt-2 h-4 w-5/6 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : sortedPosts.length > 0 ? (
        <>
          <div className="flex flex-col border border-border bg-card shadow-sm rounded overflow-hidden">
            <ItemGroup className="gap-0">
              {sortedPosts.map((post) => (
                <div key={post.id} className="border-b border-border last:border-b-0">
                  <PinnedPostCard
                    id={post.id}
                    category={post.category}
                    categoryColor={
                      CATEGORY_COLORS[post.category] || {
                        bg: "bg-slate-50",
                        border: "border-slate-200",
                        text: "text-slate-700",
                      }
                    }
                    title={post.title}
                    description={post.description}
                    date={post.date}
                    link={post.link}
                  />
                </div>
              ))}
            </ItemGroup>
          </div>

          <div className="mt-12 mb-8 flex items-center justify-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-mono px-4">
              Hiển thị {sortedPosts.length} bài ghim
            </p>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-muted-foreground mb-2">Không có bài ghim nào</p>
        </div>
      )}
    </>
  );
}
