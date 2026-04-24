"use client";

import React, { useEffect } from "react";

interface DeletePinModalProps {
  open: boolean;
  pinTitle?: string;
  isDeleting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeletePinModal({
  open,
  pinTitle,
  isDeleting = false,
  onCancel,
  onConfirm,
}: DeletePinModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDeleting) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, isDeleting, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onCancel}
        disabled={isDeleting}
        aria-label="Đóng xác nhận xóa"
      />

      <div className="relative w-full max-w-md overflow-hidden rounded-sm border border-border-color bg-white shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95">
        <div className="p-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
              <span className="material-symbols-outlined text-red-600">warning</span>
            </div>
            <h3 className="font-heading text-lg font-bold text-text-main">Xác nhận xóa bài ghim</h3>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Bạn có chắc chắn muốn xóa bài ghim
            {pinTitle ? ` \"${pinTitle}\"` : " này"}? Hành động này không thể hoàn tác.
          </p>
        </div>

        <div className="flex flex-row-reverse gap-3 bg-slate-50 px-6 py-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-sm bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? "Đang xóa..." : "Xác nhận xóa"}
          </button>
          <button
            type="button"
            className="rounded-sm border border-border-color bg-white px-4 py-2 text-sm font-bold text-text-secondary transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onCancel}
            disabled={isDeleting}
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
