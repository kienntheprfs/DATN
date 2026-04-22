"use client";

import React from "react";
import type { PinnedFormData } from "./PinnedPostTypes";

interface PinnedPostCreateViewProps {
  form: PinnedFormData;
  onChange: (field: keyof PinnedFormData, value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  isSaving: boolean;
  isEditing?: boolean;
}

export function PinnedPostCreateView({
  form,
  onChange,
  onCancel,
  onSave,
  isSaving,
  isEditing = false,
}: PinnedPostCreateViewProps) {
  return (
    <div className="max-w-400 mx-auto w-full">
      <section className="mb-8">
        <h1 className="font-heading mb-1 text-xl font-bold text-text-main">{isEditing ? "Chỉnh sửa bài ghim" : "Tạo Bài Ghim Mới"}</h1>
        <p className="text-sm text-text-secondary">Cấu hình nội dung ghim nổi bật cho bảng điều khiển giảng viên.</p>
      </section>

      <section className="mb-10 border border-border-color bg-white p-4 shadow-subtle md:p-6">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Tiêu đề</label>
            <input
              type="text"
              value={form.title}
              onChange={(event) => onChange("title", event.target.value)}
              placeholder="Nhập tiêu đề bài ghim..."
              className="h-10 w-full rounded-sm border border-border-color bg-white px-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Tóm tắt nội dung</label>
            <textarea
              rows={4}
              value={form.summary}
              onChange={(event) => onChange("summary", event.target.value)}
              placeholder="Nhập tóm tắt nội dung ngắn gọn cho giảng viên..."
              className="w-full resize-none rounded-sm border border-border-color bg-white p-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Danh mục</label>
              <div className="relative">
                <select
                  value={form.category}
                  onChange={(event) => onChange("category", event.target.value)}
                  className="h-10 w-full appearance-none rounded-sm border border-border-color bg-white px-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
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
              <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Loại văn bản</label>
              <div className="relative">
                <select
                  value={form.documentType}
                  onChange={(event) => onChange("documentType", event.target.value)}
                  className="h-10 w-full appearance-none rounded-sm border border-border-color bg-white px-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option>Quy chế / Quyết định</option>
                  <option>Thông báo nội bộ</option>
                  <option>Hướng dẫn nghiệp vụ</option>
                  <option>Tài liệu tham khảo</option>
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400">
                  expand_more
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Thẻ (tags)</label>
              <input
                type="text"
                value={form.tags}
                onChange={(event) => onChange("tags", event.target.value)}
                placeholder="DAOTAO, PINNED"
                className="h-10 w-full rounded-sm border border-border-color bg-white px-3 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <div>
              <label className="mb-2 block text-[12px] font-bold tracking-wider text-text-main uppercase">Đường dẫn bài viết gốc</label>
              <div className="relative">
                <input
                  type="url"
                  value={form.sourceUrl}
                  onChange={(event) => onChange("sourceUrl", event.target.value)}
                  placeholder="https://..."
                  className="h-10 w-full rounded-sm border border-border-color bg-white py-2 pr-3 pl-10 text-sm outline-none transition-all focus:border-primary focus:ring-1 focus:ring-primary"
                />
                <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-slate-400">
                  link
                </span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              className="px-6 py-2 text-sm font-semibold text-text-secondary transition-colors hover:text-text-main"
              onClick={onCancel}
              disabled={isSaving}
            >
              Hủy
            </button>
            <button
              type="button"
              className="rounded-sm bg-primary px-8 py-2 text-sm font-bold text-white shadow-lifted transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onSave}
              disabled={isSaving || !form.title.trim() || !form.summary.trim()}
            >
              {isSaving ? "Đang lưu..." : isEditing ? "Cập nhật bài ghim" : "Lưu Bài Ghim"}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between border-l-4 border-primary pl-4">
          <h2 className="text-[12px] font-extrabold tracking-[0.2em] text-primary uppercase">PREVIEW KẾT QUẢ</h2>
          <span className="font-mono text-[10px] text-text-secondary">LAYOUT_ID: IMAGE_58_VARIANT</span>
        </div>

        <article className="group relative overflow-hidden border border-border-color bg-white p-4 md:p-8">
          <div className="absolute top-0 right-0 -mt-16 -mr-16 h-32 w-32 rounded-full bg-primary/5 blur-3xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-2">
              <span className="rounded-sm bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-primary uppercase">
                {form.documentType}
              </span>
              <span className="font-mono text-[10px] text-slate-400">ID: REG-2024-001</span>
            </div>

            <h3 className="font-heading mt-3 text-xl font-bold leading-tight text-text-main">
              {form.title || "Quy định đào tạo trình độ đại học năm 2024"}
            </h3>

            <p className="mt-3 max-w-3xl text-[14px] leading-relaxed text-slate-600">
              {form.summary ||
                "Văn bản cập nhật các thay đổi quan trọng về hình thức đăng ký học phần, điều kiện xét tốt nghiệp và các quy định bổ sung về thực tập ngoài trường dành cho sinh viên khóa 2021 trở đi."}
            </p>

            <div className="pt-3 flex items-center justify-between">
              <a
                href={form.sourceUrl || "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center text-xs font-bold tracking-wider text-primary uppercase underline-offset-4 transition-all hover:underline"
              >
                XEM CHI TIẾT
                <span className="material-symbols-outlined ml-1 text-base">open_in_new</span>
              </a>
              <span className="font-mono text-[11px] text-slate-400 uppercase">24/10/2023</span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {(form.tags.trim() ? form.tags.split(",") : ["DAOTAO", "PINNED", "HCMUT_OFFICIAL"]).map((tag) => {
              const normalizedTag = tag.trim();
              if (!normalizedTag) {
                return null;
              }
              return (
                <span key={normalizedTag} className="bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500">
                  #{normalizedTag.toUpperCase()}
                </span>
              );
            })}
          </div>
        </article>
      </section>
    </div>
  );
}
