"use client";

import React from "react";
import type { RatingRow } from "./Rating.types";

interface RatingTableProps {
  rows: RatingRow[];
  onOpenDetail: (row: RatingRow) => void;
  isLoading?: boolean;
}

export function RatingTable({ rows, onOpenDetail, isLoading }: RatingTableProps) {
  return (
    <div className="overflow-x-auto flex-1">
      <table className="min-w-275 w-full divide-y divide-border-color">
        <thead className="bg-slate-50 sticky top-0 z-10">
          <tr>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-35">
              Session ID
            </th>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-30">
              Thời gian
            </th>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-[23%]">
              Câu hỏi từ người dùng
            </th>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-[23%]">
              Trả lời từ chatbot
            </th>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-35">
              Phản hồi
            </th>
            <th scope="col" className="px-6 py-2 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading">
              Bình luận
            </th>
            <th scope="col" className="px-6 py-2 text-center text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-42">
              Chi tiết
            </th>
          </tr>
        </thead>

        <tbody className="bg-white divide-y divide-border-color">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50 transition-colors group dense-table-row border-b border-border-color">
              <td className="px-6 whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-xs font-mono text-text-secondary truncate w-25 block" title={row.sessionId}>
                    {row.sessionId}
                  </span>
                  <span className="text-[10px] text-text-secondary">Pair {row.pair}</span>
                </div>
              </td>

              <td className="px-6 whitespace-nowrap">
                <div className="flex flex-col">
                  <span className="text-sm text-text-main font-mono">{row.date}</span>
                  <span className="text-xs text-text-secondary">{row.time}</span>
                </div>
              </td>

              <td className="px-6">
                <p className="text-sm text-text-main line-clamp-2" title={row.questionFull}>
                  {row.question}
                </p>
              </td>

              <td className="px-6">
                <p className="text-sm text-text-secondary line-clamp-2" title={row.answerFull}>
                  {row.answer}
                </p>
              </td>

              <td className="px-6 whitespace-nowrap">
                {row.sentiment === "positive" ? (
                  <div className="flex items-center gap-2 text-green-600" title="Phản hồi hài lòng">
                    <span className="material-symbols-outlined text-[20px] fill-1">thumb_up</span>
                    <span className="text-xs font-medium">Hài lòng</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-600" title="Phản hồi chưa tốt">
                    <span className="material-symbols-outlined text-[20px] fill-1">thumb_down</span>
                    <span className="text-xs font-medium">Không hài lòng</span>
                  </div>
                )}
              </td>

              <td className="px-6">
                <p className="text-sm text-text-main line-clamp-3" title={row.comment}>
                  {row.comment || "-"}
                </p>
              </td>

              <td className="px-6 whitespace-nowrap text-right text-sm font-medium">
                <button
                  type="button"
                  onClick={() => onOpenDetail(row)}
                  title="Xem chi tiết đánh giá"
                  className="inline-flex items-center gap-1.5 text-primary hover:text-blue-800 transition-colors group/btn"
                >
                  <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                  <span className="text-xs underline-offset-4 group-hover/btn:underline">Xem chi tiết</span>
                </button>
              </td>
            </tr>
          ))}

          {isLoading &&
            Array.from({ length: 3 }).map((_, index) => (
              <tr key={`rating-skeleton-${index}`} className="animate-pulse dense-table-row">
                <td className="px-6 whitespace-nowrap">
                  <div className="h-4 bg-slate-200 rounded w-20 mb-1"></div>
                  <div className="h-3 bg-slate-100 rounded w-10"></div>
                </td>
                <td className="px-6 whitespace-nowrap">
                  <div className="h-4 bg-slate-200 rounded w-16 mb-1"></div>
                  <div className="h-3 bg-slate-100 rounded w-12"></div>
                </td>
                <td className="px-6">
                  <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                </td>
                <td className="px-6">
                  <div className="h-4 bg-slate-200 rounded w-5/6"></div>
                </td>
                <td className="px-6 whitespace-nowrap">
                  <div className="flex gap-2 items-center">
                    <div className="h-5 w-5 bg-slate-200 rounded-full"></div>
                    <div className="h-3 bg-slate-200 rounded w-12"></div>
                  </div>
                </td>
                <td className="px-6">
                  <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                </td>
                <td className="px-6 whitespace-nowrap">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                </td>
              </tr>
            ))}

          {!isLoading && rows.length === 0 && (
            <tr className="dense-table-row">
              <td colSpan={7} className="px-6 py-6 text-center text-sm text-text-secondary">
                Không tìm thấy đánh giá phù hợp với bộ lọc hiện tại.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
