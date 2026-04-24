"use client";

import React from "react";
import type { RatingRow } from "./Rating.types";

interface RatingDetailModalProps {
  row: RatingRow | null;
  onClose: () => void;
}

export function RatingDetailModal({ row, onClose }: RatingDetailModalProps) {
  if (!row) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      onClick={onClose}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-detail-title"
    >
      <div
        className="bg-white w-full max-w-150 shadow-lifted border border-border-color flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color shrink-0">
          <h2 id="rating-detail-title" className="text-xl font-heading font-bold text-primary">
            Chi tiết đánh giá
          </h2>
          <button
            type="button"
            onClick={onClose}
            title="Đóng"
            className="text-text-secondary hover:text-text-main transition-colors p-1 hover:bg-slate-100 rounded-sm"
          >
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="space-y-3">
            <h3 className="text-primary font-heading font-semibold text-base">Thông tin phiên hội thoại</h3>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-baseline">
                <span className="w-35 text-text-secondary font-medium shrink-0">Session ID:</span>
                <span className="font-mono text-[#D13866] truncate">{row.sessionUuid}</span>
              </div>
              <div className="flex items-baseline">
                <span className="w-35 text-text-secondary font-medium shrink-0">Cặp hội thoại:</span>
                <span className="text-text-main">{row.pair}</span>
              </div>
              <div className="flex items-baseline">
                <span className="w-35 text-text-secondary font-medium shrink-0">Ngày tạo:</span>
                <span className="text-text-main">14:48:09 3/10/2025</span>
              </div>
              <div className="flex items-baseline">
                <span className="w-35 text-text-secondary font-medium shrink-0">Cập nhật lần cuối:</span>
                <span className="text-text-main">14:56:14 3/10/2025</span>
              </div>
            </div>
          </div>

          <hr className="border-border-color" />

          <div className="space-y-3">
            <h3 className="text-primary font-heading font-semibold text-base">Nội dung hội thoại</h3>
            <div className="space-y-2">
              <p className="text-sm font-bold text-text-secondary">Câu hỏi:</p>
              <div className="bg-slate-200/60 p-3 text-sm text-text-main leading-relaxed border border-transparent">
                {row.questionFull}
              </div>
            </div>
            <div className="space-y-2 mt-3">
              <p className="text-sm font-bold text-text-secondary">Trả lời:</p>
              <div className="bg-slate-200/60 p-3 text-sm text-text-main leading-relaxed border border-transparent">
                {row.answerFull}
              </div>
            </div>
          </div>

          <hr className="border-border-color" />

          <div className="space-y-3">
            <h3 className="text-primary font-heading font-semibold text-base">Đánh giá và bình luận</h3>
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-sm font-bold text-text-secondary w-20">Đánh giá:</span>
              <div className="flex gap-3 flex-wrap">
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                    row.sentiment === "positive"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "border-border-color text-text-secondary hover:bg-slate-50"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${row.sentiment === "positive" ? "fill-1" : ""}`}>
                    thumb_up
                  </span>
                  Hữu ích
                </button>
                <button
                  type="button"
                  className={`flex items-center gap-2 px-4 py-2 border rounded-md text-sm font-medium transition-colors ${
                    row.sentiment === "negative"
                      ? "bg-primary text-white border-primary shadow-sm"
                      : "border-border-color text-text-secondary hover:bg-slate-50"
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${row.sentiment === "negative" ? "fill-1" : ""}`}>
                    thumb_down
                  </span>
                  Chưa tốt
                </button>
              </div>
            </div>

            <div className="space-y-2 mt-4">
              <p className="text-sm font-bold text-text-secondary">Bình luận (Lý do chưa tốt):</p>
              <div className="bg-slate-50 p-3 text-sm text-text-main leading-relaxed border border-border-color rounded-sm">
                {row.comment || "Không có bình luận"}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border-color bg-slate-50/50 flex justify-end gap-3 shrink-0">
          <button
            type="button"
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium"
          >
            <span className="material-symbols-outlined text-[18px]">forum</span>
            <span>Xem cuộc hội thoại gốc</span>
          </button>
        </div>
      </div>
    </div>
  );
}
