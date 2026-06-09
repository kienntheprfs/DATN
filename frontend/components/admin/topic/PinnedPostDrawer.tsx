"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { pinnedPostService, PinnedPostItemResponse, PinnedPostCategory } from "@/services/pinned-post-api";
import { toast } from "sonner";
import { CreatePinnedPostModal } from "./CreatePinnedPostModal";

interface PinnedPostDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  linkedPinnedPostIds: string[];
  onLinkPinnedPost: (postId: string) => void;
  onUnlinkPinnedPost: (postId: string) => void;
  isConfirmed: boolean;
  onConfirm: () => void;
  onUnpin: () => void;
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

export function PinnedPostDrawer({
  isOpen,
  onClose,
  topicTitle,
  linkedPinnedPostIds = [],
  onLinkPinnedPost,
  onUnlinkPinnedPost,
  isConfirmed,
  onConfirm,
  onUnpin,
}: PinnedPostDrawerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const PAGE_SIZE = 5;

  const handleCreated = async (newPostId: string) => {
    // Invalidate queries to refresh available and linked posts lists
    await queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts"] });
    await queryClient.invalidateQueries({ queryKey: ["all-admin-pinned-posts"] });
    
    // Automatically link the newly created pinned post
    onLinkPinnedPost(newPostId);
    toast.success("Đã tự động liên kết bài ghim vừa tạo!");
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch available pinned posts from admin list
  const { data, isLoading } = useQuery({
    queryKey: ["admin-pinned-posts", debouncedSearch, page],
    queryFn: () =>
      pinnedPostService.listAdmin({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
      }),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const availablePosts = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  // Since there's no single PinnedPost detail GET endpoint,
  // we fetch a larger list of pinned posts to find details of linked posts.
  const { data: allPostsData } = useQuery({
    queryKey: ["all-admin-pinned-posts"],
    queryFn: () =>
      pinnedPostService.listAdmin({
        page: 1,
        page_size: 100,
      }),
    enabled: isOpen && linkedPinnedPostIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const allPosts = allPostsData?.items ?? [];
  const linkedPosts = linkedPinnedPostIds
    .map((id) => allPosts.find((p) => p.id === id))
    .filter((p): p is PinnedPostItemResponse => !!p);

  return (
    <>
      <div
        className={`absolute right-0 top-0 bottom-0 z-40 flex flex-col border-l border-border-color bg-white shadow-2xl transition-all duration-300 ease-in-out ${
          isOpen ? "translate-x-0 w-full sm:w-[480px]" : "translate-x-full pointer-events-none w-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-6 py-4">
          <div>
            <h1 className="font-heading text-lg font-bold text-slate-800">
              Bài ghim trang chủ
            </h1>
            <div className="text-sm font-semibold text-slate-800 mt-1 line-clamp-1" title={topicTitle}>
              Chủ đề: {topicTitle.replace(/_/g, " ")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Status block */}
          <div className="rounded-sm border p-4 bg-slate-50 border-border-color flex items-center justify-between">
            <div>
              <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Trạng thái ghim</span>
              <div className="mt-1 flex items-center gap-1.5">
                {isConfirmed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Đã ghim
                  </span>
                ) : linkedPinnedPostIds.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-600">
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    Đang thiết lập
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-600">
                    <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                    Chờ liên kết
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Đã liên kết</span>
              <p className="text-xl font-extrabold text-slate-900">{linkedPinnedPostIds.length} bài ghim</p>
            </div>
          </div>

          {/* Linked Pinned Posts List */}
          <div>
            <h4 className="font-heading text-base font-bold text-slate-900 uppercase tracking-wide mb-3">
              Bài ghim đã đính kèm
            </h4>

            {linkedPosts.length === 0 ? (
              <div className="rounded-sm border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
                <span className="material-symbols-outlined text-4xl text-slate-300">link_off</span>
                <p className="text-base font-semibold text-slate-800 mt-2">Chưa liên kết bài ghim nào.</p>
                <p className="text-sm font-semibold text-slate-700 mt-1">Chọn bài ghim từ thư viện bên dưới để đính kèm.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {linkedPosts.map((post) => {
                  const colors = CATEGORY_COLORS[post.category] || {
                    bg: "bg-slate-50",
                    border: "border-slate-200",
                    text: "text-slate-700",
                  };
                  return (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-3 border border-border-color bg-white rounded-sm shadow-sm transition-all hover:shadow-md"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <p className="text-sm font-bold text-slate-900 truncate" title={post.title}>
                          {post.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 border uppercase rounded ${colors.bg} ${colors.border} ${colors.text}`}>
                            {post.category}
                          </span>
                          {post.document_type && (
                            <span className="text-[9px] font-mono text-slate-500 uppercase bg-slate-100 px-1 rounded font-bold truncate">
                              {post.document_type}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {!isConfirmed && (
                          <button
                            onClick={() => onUnlinkPinnedPost(post.id)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 transition-colors cursor-pointer"
                            title="Gỡ liên kết"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add Pinned Post Section */}
          <div className="border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-heading text-base font-bold text-slate-900 uppercase tracking-wide">
                Thư viện bài ghim sẵn có
              </h4>
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-1 text-sm font-bold text-primary hover:text-blue-800 hover:underline cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add_box</span>
                Tạo bài ghim mới
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm bài ghim theo tiêu đề, danh mục..."
                className="w-full rounded-sm border border-border-color bg-slate-50 py-2 pl-9 pr-4 text-sm font-semibold text-slate-800 transition-all outline-none focus:border-primary focus:bg-white"
              />
            </div>

            {/* Library list */}
            {isLoading ? (
              <div className="space-y-2 py-4 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-sm" />
                ))}
              </div>
            ) : availablePosts.length === 0 ? (
              <div className="text-center py-8 text-slate-800 text-base font-bold border border-dashed border-slate-200 rounded-sm bg-slate-50">
                Không tìm thấy bài ghim phù hợp.
              </div>
            ) : (
              <div className="space-y-2">
                {availablePosts.map((post) => {
                  const isLinked = linkedPinnedPostIds.includes(post.id);
                  const colors = CATEGORY_COLORS[post.category] || {
                    bg: "bg-slate-50",
                    border: "border-slate-200",
                    text: "text-slate-700",
                  };
                  return (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-2.5 border border-slate-100 bg-slate-50/50 rounded-sm text-sm"
                    >
                      <div className="min-w-0 pr-3 flex-1">
                        <p className="font-bold text-slate-800 truncate text-sm" title={post.title}>
                          {post.title}
                        </p>
                        <p className="text-xs font-semibold text-slate-500 mt-0.5 truncate">
                          {post.category}
                        </p>
                      </div>

                      <button
                        disabled={isLinked || isConfirmed}
                        onClick={() => onLinkPinnedPost(post.id)}
                        className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm border transition-all cursor-pointer ${
                          isLinked
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-primary border-primary hover:bg-blue-50"
                        }`}
                      >
                        {isLinked ? (
                          <>
                            <span className="material-symbols-outlined text-[14px]">check</span>
                            Đã gán
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[14px]">link</span>
                            Liên kết
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Library Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3 text-xs">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="font-bold text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:underline cursor-pointer"
                    >
                      ← Trước
                    </button>
                    <span className="text-slate-500 font-medium">{page} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="font-bold text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:underline cursor-pointer"
                    >
                      Sau →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border-color bg-slate-50 px-6 py-4 flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 rounded-sm border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          
          {isConfirmed ? (
            <button
              onClick={onUnpin}
              className="flex-1 rounded-sm border border-red-300 bg-red-50 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">bookmark_remove</span>
              Bỏ ghim
            </button>
          ) : (
            <button
              disabled={linkedPinnedPostIds.length === 0}
              onClick={onConfirm}
              className={`flex-[2] flex items-center justify-center gap-2 rounded-sm py-2 text-sm font-bold text-white shadow-md transition-colors cursor-pointer ${
                linkedPinnedPostIds.length === 0
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-primary hover:bg-blue-800"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">push_pin</span>
              Xác nhận ghim
            </button>
          )}
        </div>
      </div>

      <CreatePinnedPostModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
}
