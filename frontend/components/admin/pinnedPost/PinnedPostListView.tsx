"use client";

import React from "react";
import type { PinnedCategory, PinnedPost, PinnedSortMode } from "./PinnedPostTypes";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface PinnedPostListViewProps {
  items: PinnedPost[];
  overallTotalPins: number;
  totalItems: number;
  pageStartIndex: number;
  pageEndIndex: number;
  activeSlots: number;
  maxSlots: number;
  activeSlotsText: string;
  topCategoryText: string;
  topCategoryShareText: string;
  lastUpdateText: string;
  lastUpdateRelativeText: string;
  isLoading?: boolean;
  isError?: boolean;
  search: string;
  category: "all" | PinnedCategory;
  sortMode: PinnedSortMode;
  currentPage: number;
  totalPages: number;
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: "all" | PinnedCategory) => void;
  onSortChange: (value: PinnedSortMode) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onAddNewPin: () => void;
  onEditPin: (item: PinnedPost) => void;
  onRequestDelete: (item: PinnedPost) => void;
  onDragStart: (item: PinnedPost) => void;
  onDragEnd: () => void;
  onDragOverRow: (item: PinnedPost, position: "before" | "after") => void;
  onDropRow: (item: PinnedPost, position: "before" | "after") => void;
  draggingItemId: string | null;
  dragOverItemId: string | null;
  dragOverPosition: "before" | "after" | null;
  canReorder: boolean;
  isReordering: boolean;
  onRetry: () => void;
}

const CATEGORY_BADGE: Record<PinnedCategory, string> = {
  "Quy chế Đào tạo": "bg-blue-50 text-blue-700 border-blue-100",
  "Sau Đại học": "bg-purple-50 text-purple-700 border-purple-100",
  "Công tác Sinh viên": "bg-amber-50 text-amber-700 border-amber-100",
  "Nghiên cứu Khoa học": "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export function PinnedPostListView({
  items,
  overallTotalPins,
  totalItems,
  pageStartIndex,
  pageEndIndex,
  activeSlots,
  maxSlots,
  activeSlotsText,
  topCategoryText,
  topCategoryShareText,
  lastUpdateText,
  lastUpdateRelativeText,
  isLoading = false,
  isError = false,
  search,
  category,
  sortMode,
  currentPage,
  totalPages,
  onSearchChange,
  onCategoryChange,
  onSortChange,
  onPrevPage,
  onNextPage,
  onAddNewPin,
  onEditPin,
  onRequestDelete,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
  draggingItemId,
  dragOverItemId,
  dragOverPosition,
  canReorder,
  isReordering,
  onRetry,
}: PinnedPostListViewProps) {
  const activeSlotsWidth = Math.max(0, Math.min(100, (activeSlots / Math.max(maxSlots, 1)) * 100));

  return (
    <div className="max-w-400 mx-auto w-full">
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          {/* <nav className="mb-2 flex gap-2 font-mono text-[11px] uppercase tracking-widest text-slate-500">
            <span>ADMIN</span>
            <span>/</span>
            <span>CONTENT</span>
            <span>/</span>
            <span className="font-bold text-primary">PINNED TOPICS</span>
          </nav> */}
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">Quản lý Bài ghim Chủ đề</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý các quy định và thông báo ưu tiên được hiển thị trên trang chủ của khoa.
          </p>
        </div>
        <button
          type="button"
          onClick={onAddNewPin}
          className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary-dark sm:w-auto"
        >
          <span className="material-symbols-outlined text-sm">push_pin</span>
          Thêm Bài ghim mới
        </button>
      </div>

      <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        <article className="border border-border-color bg-white p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tổng số bài ghim</div>
          <div className="font-heading text-2xl font-bold text-slate-900">{overallTotalPins}</div>
          {/* <div className="mt-2 flex items-center gap-1 font-mono text-[11px] text-green-600">
            <span className="material-symbols-outlined text-[14px]">trending_up</span>
            +2 THIS MONTH
          </div> */}
        </article>
        <article className="border border-border-color bg-white p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Vị trí đang dùng</div>
          <div className="font-heading text-2xl font-bold text-slate-900">{activeSlotsText}</div>
          <div className="mt-4 h-1 w-full bg-slate-100">
            <div className="h-1 bg-primary" style={{ width: `${activeSlotsWidth}%` }} />
          </div>
        </article>
        <article className="border border-border-color bg-white p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Danh mục phổ biến</div>
          <div className="font-heading truncate text-lg font-bold text-slate-900">{topCategoryText}</div>
          <div className="mt-2 font-mono text-[11px] text-slate-500">{topCategoryShareText}</div>
        </article>
        <article className="border border-border-color bg-white p-4">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cập nhật cuối</div>
          <div className="font-heading text-lg font-bold text-slate-900">{lastUpdateText}</div>
          <div className="mt-2 font-mono text-[11px] text-slate-500">{lastUpdateRelativeText}</div>
        </article>
      </section>

      <section className="rounded-t-sm border border-border-color border-b-0 bg-white p-4">
        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-slate-400">search</span>
            <input
              type="text"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Tìm kiếm theo tiêu đề hoặc mã quy định..."
              className="w-full rounded-sm border border-border-color py-2 pr-4 pl-10 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={category}
              onChange={(event) => onCategoryChange(event.target.value as "all" | PinnedCategory)}
              className="rounded-sm border border-border-color bg-white py-2 pr-8 pl-3 text-sm focus:ring-1 focus:ring-primary"
            >
              <option value="all">Tất cả danh mục</option>
              <option value="Quy chế Đào tạo">Quy chế Đào tạo</option>
              <option value="Công tác Sinh viên">Công tác Sinh viên</option>
              <option value="Nghiên cứu Khoa học">Nghiên cứu Khoa học</option>
              <option value="Sau Đại học">Sau Đại học</option>
            </select>
            <select
              value={sortMode}
              onChange={(event) => onSortChange(event.target.value as PinnedSortMode)}
              className="rounded-sm border border-border-color bg-white py-2 pr-8 pl-3 text-sm focus:ring-1 focus:ring-primary"
            >
              <option value="latest">Sắp xếp: Bài ghim mới nhất</option>
              <option value="manual">Sắp xếp: Thứ tự tùy chỉnh</option>
              <option value="alphabetical">Sắp xếp: Theo bảng chữ cái</option>
            </select>
          </div>
        </div>
      </section>

      <section className="overflow-x-auto border border-border-color bg-white">
        {isError ? (
          <div className="mx-4 my-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Không thể tải danh sách bài ghim. Vui lòng thử lại.
            <button
              type="button"
              onClick={onRetry}
              className="ml-3 font-semibold underline decoration-red-400 underline-offset-2"
            >
              Tải lại
            </button>
          </div>
        ) : null}

        <TooltipProvider delayDuration={250}>
          <table className="w-full min-w-260 text-left text-sm">
            <thead>
              <tr className="border-b border-border-color bg-slate-50">
                <th className="w-16 px-4 py-3 text-center text-[11px] font-bold tracking-widest text-slate-600 uppercase">Thứ tự</th>
                <th className="px-6 py-3 text-[11px] font-bold tracking-widest text-slate-600 uppercase">Tiêu đề Chủ đề</th>
                <th className="px-6 py-3 text-[11px] font-bold tracking-widest text-slate-600 uppercase">Danh mục</th>
                <th className="px-6 py-3 text-[11px] font-bold tracking-widest text-slate-600 uppercase">Ngày ghim</th>
                <th className="px-6 py-3 text-right text-[11px] font-bold tracking-widest text-slate-600 uppercase">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color">
              {isLoading ? (
                <tr className="animate-pulse">
                  <td className="px-4 py-4"><div className="h-5 w-8 rounded bg-slate-200" /></td>
                  <td className="px-6 py-4">
                    <div className="h-5 w-2/3 rounded bg-slate-200" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-slate-100" />
                  </td>
                  <td className="px-6 py-4"><div className="h-5 w-32 rounded bg-slate-200" /></td>
                  <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-slate-200" /></td>
                  <td className="px-6 py-4"><div className="ml-auto h-5 w-14 rounded bg-slate-200" /></td>
                </tr>
              ) : null}

              {!isLoading && items.map((item) => (
                <React.Fragment key={item.id}>
                  {dragOverItemId === item.id && dragOverPosition === "before" ? (
                    <tr aria-hidden>
                      <td colSpan={5} className="p-0">
                        <div className="h-1.5 bg-amber-300" />
                      </td>
                    </tr>
                  ) : null}

                  <tr
                    className={`group transition-colors hover:bg-slate-50 ${draggingItemId === item.id ? "opacity-60" : ""}`}
                    draggable={canReorder && !isReordering}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", item.id);
                      onDragStart(item);
                    }}
                    onDragEnd={onDragEnd}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      const rowRect = (event.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                      const isBefore = event.clientY < rowRect.top + rowRect.height / 2;
                      onDragOverRow(item, isBefore ? "before" : "after");
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const rowRect = (event.currentTarget as HTMLTableRowElement).getBoundingClientRect();
                      const isBefore = event.clientY < rowRect.top + rowRect.height / 2;
                      onDropRow(item, isBefore ? "before" : "after");
                    }}
                  >
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`material-symbols-outlined ${canReorder && !isReordering ? "cursor-grab text-slate-400 hover:text-primary active:cursor-grabbing" : "text-slate-300"}`}
                      title={canReorder ? "Kéo để đổi thứ tự" : "Chuyển sang sắp xếp thủ công và xóa bộ lọc để đổi thứ tự"}
                    >
                      drag_indicator
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="line-clamp-1 font-bold text-slate-900 transition-colors group-hover:text-primary">{item.title}</span>
                        </TooltipTrigger>
                        <TooltipContent>{item.title}</TooltipContent>
                      </Tooltip>
                      <span className="mt-0.5 font-mono text-[11px] text-slate-500">ID: {item.refId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase ${CATEGORY_BADGE[item.category]}`}
                    >
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-600">{item.pinnedDate}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 text-slate-400 transition-all hover:bg-slate-100 hover:text-primary"
                            title="Chỉnh sửa"
                            onClick={() => onEditPin(item)}
                          >
                            <span className="material-symbols-outlined text-lg">edit_note</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Chỉnh sửa</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="rounded p-1.5 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600"
                            title="Gỡ ghim"
                            onClick={() => onRequestDelete(item)}
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Xóa bài ghim</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                  </tr>

                  {dragOverItemId === item.id && dragOverPosition === "after" ? (
                    <tr aria-hidden>
                      <td colSpan={5} className="p-0">
                        <div className="h-1.5 bg-amber-300" />
                      </td>
                    </tr>
                  ) : null}

                </React.Fragment>
              ))}

              {!isLoading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-slate-500">
                    Không có bài ghim phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </TooltipProvider>
      </section>

      <section className="mt-4 flex flex-col items-start justify-between gap-4 font-mono text-xs text-slate-500 md:flex-row md:items-center">
        <div>
          HIỂN THỊ {pageStartIndex}-{pageEndIndex} TRONG {totalItems} CHỦ ĐỀ ({overallTotalPins} TỔNG CỘNG)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm border border-slate-200 p-1 transition-colors hover:bg-slate-50 disabled:opacity-50"
            disabled={currentPage === 1}
            onClick={onPrevPage}
          >
            <span className="material-symbols-outlined text-sm">chevron_left</span>
          </button>
          <span className="px-2">TRANG {currentPage} TRONG {totalPages}</span>
          <button
            type="button"
            className="rounded-sm border border-slate-200 p-1 transition-colors hover:bg-slate-50 disabled:opacity-50"
            disabled={currentPage === totalPages}
            onClick={onNextPage}
          >
            <span className="material-symbols-outlined text-sm">chevron_right</span>
          </button>
        </div>
      </section>

      {/* <section className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-widest text-slate-900 uppercase">
            <span className="material-symbols-outlined text-sm text-primary">history</span>
            Recent Activity Log
          </h3>
          <div className="space-y-3">
            <article className="flex items-start gap-3 border border-border-color bg-white p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-blue-50">
                <span className="material-symbols-outlined text-sm text-primary">update</span>
              </div>
              <div>
                <div className="text-xs font-bold tracking-tight text-slate-900 uppercase">Order Updated</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  &quot;Regulations on Student Assessment&quot; moved from #3 to #1.
                </div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">Today, 09:45 • Admin_Viet_Nguyen</div>
              </div>
            </article>
            <article className="flex items-start gap-3 border border-border-color bg-white p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-green-50">
                <span className="material-symbols-outlined text-sm text-green-600">add_circle</span>
              </div>
              <div>
                <div className="text-xs font-bold tracking-tight text-slate-900 uppercase">New Pin Added</div>
                <div className="mt-0.5 text-xs text-slate-500">
                  &quot;Research Ethics Board Application Process&quot; was pinned.
                </div>
                <div className="mt-1 font-mono text-[10px] text-slate-400">Yesterday, 14:20 • Admin_Thu_Ha</div>
              </div>
            </article>
          </div>
        </div>

        <div>
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-widest text-slate-900 uppercase">
            <span className="material-symbols-outlined text-sm text-primary">lightbulb</span>
            Pinning Logic
          </h3>
          <article className="rounded-sm bg-primary p-6 text-white shadow-lg">
            <p className="text-xs leading-relaxed italic opacity-90">
              &quot;Pinned topics appear at the top of the &apos;Regulatory Insight&apos; dashboard for all faculty members.
              Recommended to keep between 6-10 pins for optimal readability.&quot;
            </p>
            <div className="mt-4 border-t border-white/20 pt-4">
              <div className="mb-2 text-[10px] font-bold tracking-widest uppercase">Primary Rules:</div>
              <ul className="space-y-2 text-xs opacity-80">
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Manual sorting overrides date.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Only published PDFs can be pinned.
                </li>
                <li className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  Auto-unpin after 180 days (optional).
                </li>
              </ul>
            </div>
          </article>
        </div>
      </section> */}
    </div>
  );
}
