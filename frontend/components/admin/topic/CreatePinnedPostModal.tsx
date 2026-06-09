"use client";
import React, { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pinnedPostService, PinnedPostCategory } from "@/services/pinned-post-api";

interface CreatePinnedPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (newPostId: string) => void;
}

interface PinnedFormData {
  title: string;
  summary: string;
  documentType: string;
  sourceUrl: string;
  category: PinnedPostCategory;
  tags: string;
}

const INITIAL_FORM: PinnedFormData = {
  title: "",
  summary: "",
  documentType: "Quy chế / Quyết định",
  sourceUrl: "",
  category: "Quy chế Đào tạo",
  tags: "DAOTAO, PINNED",
};

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

export function CreatePinnedPostModal({ isOpen, onClose, onCreated }: CreatePinnedPostModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PinnedFormData>(INITIAL_FORM);

  useEffect(() => {
    if (isOpen) {
      setForm(INITIAL_FORM);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const payload = useMemo(() => {
    const tags = form.tags
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      title: form.title.trim(),
      summary: form.summary.trim(),
      document_type: form.documentType.trim(),
      source_url: form.sourceUrl.trim(),
      category: form.category,
      tags,
    };
  }, [form]);

  const saveMutation = useMutation({
    mutationFn: () => pinnedPostService.create(payload),
    onSuccess: (data) => {
      toast.success("Đã tạo bài ghim mới thành công.");
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts-manual-all"] });
      onCreated?.(data.id);
      onClose();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể lưu bài ghim. Vui lòng thử lại.";
      toast.error(message);
    },
  });

  const handleSave = () => {
    if (!payload.title || !payload.summary) {
      toast.error("Vui lòng nhập tiêu đề và tóm tắt trước khi lưu.");
      return;
    }
    saveMutation.mutate();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-[640px] max-w-full shadow-2xl border border-border-color flex flex-col max-h-[90vh] overflow-hidden rounded-sm animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-6 py-4 shrink-0">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-800">Tạo bài ghim mới</h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              Cấu hình nội dung ghim nổi bật cho trang chủ.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Scrollable Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar bg-slate-50/30">
          {/* Title input */}
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((curr) => ({ ...curr, title: e.target.value }))}
              placeholder="Nhập tiêu đề bài ghim..."
              className="h-10 w-full rounded-sm border border-border-color bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Summary textarea */}
          <div>
            <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
              Tóm tắt nội dung <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={form.summary}
              onChange={(e) => setForm((curr) => ({ ...curr, summary: e.target.value }))}
              placeholder="Nhập tóm tắt nội dung ngắn gọn..."
              className="w-full resize-none rounded-sm border border-border-color bg-white p-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Grid fields */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
                Danh mục
              </label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(e) => setForm((curr) => ({ ...curr, category: e.target.value as PinnedPostCategory }))}
                  className="h-10 w-full appearance-none rounded-sm border border-border-color bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="Quy chế Đào tạo">Quy chế Đào tạo</option>
                  <option value="Công tác Sinh viên">Công tác Sinh viên</option>
                  <option value="Nghiên cứu Khoa học">Nghiên cứu Khoa học</option>
                  <option value="Sau Đại học">Sau Đại học</option>
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400">
                  expand_more
                </span>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
                Loại văn bản
              </label>
              <div className="relative">
                <select
                  value={form.documentType}
                  onChange={(e) => setForm((curr) => ({ ...curr, documentType: e.target.value }))}
                  className="h-10 w-full appearance-none rounded-sm border border-border-color bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="Quy chế / Quyết định">Quy chế / Quyết định</option>
                  <option value="Thông báo nội bộ">Thông báo nội bộ</option>
                  <option value="Hướng dẫn nghiệp vụ">Hướng dẫn nghiệp vụ</option>
                  <option value="Tài liệu tham khảo">Tài liệu tham khảo</option>
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400">
                  expand_more
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
                Thẻ (tags)
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => setForm((curr) => ({ ...curr, tags: e.target.value }))}
                placeholder="DAOTAO, PINNED"
                className="h-10 w-full rounded-sm border border-border-color bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold tracking-wider text-slate-700 uppercase">
                Đường dẫn bài viết gốc
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={form.sourceUrl}
                  onChange={(e) => setForm((curr) => ({ ...curr, sourceUrl: e.target.value }))}
                  placeholder="https://..."
                  className="h-10 w-full rounded-sm border border-border-color bg-white py-2 pr-3 pl-9 text-sm font-semibold text-slate-800 outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-slate-400">
                  link
                </span>
              </div>
            </div>
          </div>

          {/* Real-time Preview Section */}
          <div className="border-t border-slate-200 pt-4 mt-2">
            <div className="flex items-center justify-between border-l-4 border-primary pl-3 mb-3">
              <h4 className="text-xs font-bold tracking-widest text-primary uppercase">
                PREVIEW BÀI GHIM
              </h4>
            </div>

            <article className="group relative overflow-hidden border border-border-color bg-white p-5 shadow-sm rounded-sm">
              <div className="absolute top-0 right-0 -mt-16 -mr-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-2">
                  <span className="rounded-sm bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary uppercase">
                    {form.documentType}
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">PREVIEW</span>
                </div>

                <h3 className="font-heading mt-3 text-base font-bold leading-tight text-slate-800 line-clamp-2" title={form.title}>
                  {form.title || "Tiêu đề bài ghim sẽ hiển thị tại đây..."}
                </h3>

                <p className="mt-2.5 text-xs leading-relaxed text-slate-600 line-clamp-3" title={form.summary}>
                  {form.summary ||
                    "Tóm tắt nội dung của bài ghim sẽ hiển thị tại đây. Vui lòng nhập nội dung tóm tắt để người xem nắm bắt thông tin nhanh chóng."}
                </p>

                <div className="pt-3 flex items-center justify-between border-t border-slate-50 mt-3">
                  <span
                    className="flex items-center text-[10px] font-bold tracking-wider text-primary uppercase underline-offset-4 pointer-events-none"
                  >
                    XEM CHI TIẾT
                    <span className="material-symbols-outlined ml-0.5 text-sm">open_in_new</span>
                  </span>
                  <span className="font-mono text-[10px] text-slate-400 uppercase">Hôm nay</span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                {(form.tags.trim() ? form.tags.split(",") : ["DAOTAO", "PINNED"]).map((tag) => {
                  const normalizedTag = tag.trim();
                  if (!normalizedTag) return null;
                  return (
                    <span key={normalizedTag} className="bg-slate-50 px-2 py-0.5 font-mono text-[9px] font-bold text-slate-500 rounded-sm">
                      #{normalizedTag.toUpperCase()}
                    </span>
                  );
                })}
              </div>
            </article>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-border-color flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={saveMutation.isPending}
            className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !form.title.trim() || !form.summary.trim()}
            className="px-5 py-2 bg-primary text-white rounded-md text-sm font-bold shadow-md hover:bg-blue-800 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                Lưu bài ghim
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
