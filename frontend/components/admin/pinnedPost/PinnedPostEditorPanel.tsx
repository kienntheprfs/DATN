"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PinnedPostCreateView } from "./PinnedPostCreateView";
import type { PinnedFormData, PinnedPost } from "./PinnedPostTypes";
import { pinnedPostService } from "@/services/pinned-post-api";

const INITIAL_FORM: PinnedFormData = {
  title: "Quy định đào tạo trình độ đại học năm 2024",
  summary:
    "Văn bản cập nhật các thay đổi quan trọng về hình thức đăng ký học phần, điều kiện xét tốt nghiệp và các quy định bổ sung về thực tập ngoài trường dành cho sinh viên khóa 2021 trở đi.",
  documentType: "Quy chế / Quyết định",
  sourceUrl: "https://hcmut.edu.vn/dao-tao/quy-dinh-2024",
  category: "Quy chế Đào tạo",
  tags: "DAOTAO, PINNED",
};

function toFormValue(item: PinnedPost): PinnedFormData {
  return {
    title: item.title,
    summary: item.summary,
    documentType: item.documentType,
    sourceUrl: item.sourceUrl,
    category: item.category,
    tags: item.tags.join(", "),
  };
}

interface PinnedPostEditorPanelProps {
  editingPost: PinnedPost | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function PinnedPostEditorPanel({ editingPost, onSaved, onCancel }: PinnedPostEditorPanelProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PinnedFormData>(() => (editingPost ? toFormValue(editingPost) : INITIAL_FORM));

  const isEditing = Boolean(editingPost);

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
    mutationFn: async () => {
      if (isEditing && editingPost) {
        return pinnedPostService.update(editingPost.id, payload);
      }
      return pinnedPostService.create(payload);
    },
    onSuccess: () => {
      toast.success(isEditing ? "Đã cập nhật bài ghim thành công." : "Đã tạo bài ghim mới thành công.");
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts"] });
      queryClient.invalidateQueries({ queryKey: ["admin-pinned-posts-manual-all"] });
      onSaved();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể lưu bài ghim. Vui lòng thử lại.";
      toast.error(message);
    },
  });

  return (
    <PinnedPostCreateView
      form={form}
      isEditing={isEditing}
      onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      onCancel={onCancel}
      onSave={() => {
        if (!payload.title || !payload.summary) {
          toast.error("Vui lòng nhập tiêu đề và tóm tắt trước khi lưu.");
          return;
        }
        saveMutation.mutate();
      }}
      isSaving={saveMutation.isPending}
    />
  );
}
