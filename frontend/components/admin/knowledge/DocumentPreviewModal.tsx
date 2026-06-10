"use client";

import React from "react";
import { Document } from "./DocumentTable";
import { PdfPreviewPanel } from "./PdfPreviewPanel";
import { knowledgeService } from "@/services/knowledge-api";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface DocumentPreviewModalProps {
  document: Document | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  const queryClient = useQueryClient();
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(true);
  const [localDoc, setLocalDoc] = React.useState<Document | null>(null);
  const [isEditing, setIsEditing] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // States for editable fields
  const [editTitle, setEditTitle] = React.useState("");
  const [editSummary, setEditSummary] = React.useState("");
  const [editCode, setEditCode] = React.useState("");
  const [editSignedDate, setEditSignedDate] = React.useState("");
  const [editUnit, setEditUnit] = React.useState("");
  const [editDocumentType, setEditDocumentType] = React.useState("");
  const [editTags, setEditTags] = React.useState("");

  const convertDmyToYmd = (dmy: string): string => {
    if (!dmy || dmy.includes("-") || dmy.includes("--")) return "";
    const parts = dmy.split("/");
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    return "";
  };

  const convertYmdToDmy = (ymd: string): string => {
    if (!ymd) return "--/--/----";
    const parts = ymd.split("-");
    if (parts.length === 3) {
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    }
    return "--/--/----";
  };

  React.useEffect(() => {
    if (!document) {
      return;
    }
    setLocalDoc(document);
    setIsPreviewLoading(true);
    setIsEditing(false);
  }, [document]);

  const handleStartEditing = async () => {
    if (!localDoc) return;
    try {
      setIsPreviewLoading(true);
      const detail = await knowledgeService.getDocumentDetail(Number(localDoc.id));
      const meta = detail.meta_data || {};

      setEditTitle(detail.title || localDoc.title);
      setEditCode(String(meta.code || localDoc.code || ""));
      setEditSummary(String(meta.summary || localDoc.summary || ""));
      setEditSignedDate(convertDmyToYmd(String(meta.signed_date || localDoc.signedDate || "")));
      setEditUnit(String(meta.unit || localDoc.unit || "Phòng Đào Tạo"));
      setEditDocumentType(String(meta.document_type || meta.document_kind || localDoc.documentType || "Quyết định"));
      setEditTags(Array.isArray(meta.tags) ? meta.tags.join(", ") : localDoc.tags.join(", "));

      setIsEditing(true);
    } catch {
      toast.error("Không thể tải thông tin chi tiết để chỉnh sửa.");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!localDoc) return;
    setIsSaving(true);
    try {
      const detail = await knowledgeService.getDocumentDetail(Number(localDoc.id));
      const existingMeta = detail.meta_data || {};

      const signedYear = editSignedDate ? new Date(editSignedDate).getFullYear() : undefined;
      const tagsArray = editTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);

      const updatedMeta = {
        ...existingMeta,
        summary: editSummary || undefined,
        code: editCode || undefined,
        signed_date: editSignedDate || undefined,
        signed_year: Number.isFinite(signedYear) ? signedYear : undefined,
        unit: editUnit || undefined,
        document_type: editDocumentType || undefined,
        tags: tagsArray,
      };

      await knowledgeService.updateDocument(localDoc.id, {
        title: editTitle,
        meta_data: updatedMeta,
      });

      setLocalDoc((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          title: editTitle,
          code: editCode || `DOC-${prev.id}`,
          summary: editSummary,
          signedDate: convertYmdToDmy(editSignedDate),
          unit: editUnit,
          documentType: editDocumentType,
          tags: tagsArray,
        };
      });

      toast.success("Cập nhật thông tin tài liệu thành công.");
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-documents"] });
      setIsEditing(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể cập nhật thông tin tài liệu.";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!document || !localDoc) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <style>{`
        @keyframes knowledge-meta-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity cursor-pointer" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-[96vw] xl:max-w-300 bg-surface rounded-sm shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 border border-slate-200" style={{ height: "95vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">description</span>
            </div>
            <div>
              <h2 className="text-base font-heading font-bold text-text-main">{localDoc.title}</h2>
              <p className="text-xs text-text-secondary">Văn bản gốc • {isEditing ? "Chỉnh sửa" : "Xem trước"}</p>
            </div>
          </div>

          <button
            className="text-text-secondary hover:text-red-500 transition-colors p-1 rounded hover:bg-slate-200"
            onClick={onClose}
            aria-label="Đóng"
          >
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
          {/* Document Preview Area */}
          <div className="w-full lg:w-7/12 bg-slate-100 border-b lg:border-b-0 lg:border-r border-border-color overflow-y-auto p-4 md:p-8 flex justify-center">
            <PdfPreviewPanel
              file={localDoc.fileUrl || null}
              fileName={localDoc.fileName || localDoc.title}
              className="w-full"
              onLoadingStateChange={setIsPreviewLoading}
            />
          </div>

          {/* Right Panel - Info & Actions */}
          <div className="w-full lg:w-5/12 bg-surface flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-heading font-bold text-text-main mb-4 uppercase tracking-wider border-b border-border-color pb-2">
                {isEditing ? "Chỉnh sửa thông tin" : "Thông tin văn bản"}
              </h3>

              {isPreviewLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={`meta-skeleton-${index}`} className="grid grid-cols-3 gap-4">
                      <div className="relative h-4 overflow-hidden rounded bg-slate-200">
                        <span className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                      </div>
                      <div className="relative col-span-2 h-4 overflow-hidden rounded bg-slate-100">
                        <span className="absolute inset-y-0 w-20 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                      </div>
                    </div>
                  ))}
                  <div className="pt-4 border-t border-border-color">
                    <div className="relative mb-2 h-4 w-34 overflow-hidden rounded bg-slate-200">
                      <span className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                    </div>
                    <div className="rounded border border-slate-100 bg-slate-50 p-3 space-y-2">
                      <div className="relative h-3 overflow-hidden rounded bg-slate-200">
                        <span className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                      </div>
                      <div className="relative h-3 overflow-hidden rounded bg-slate-200">
                        <span className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                      </div>
                      <div className="relative h-3 w-2/3 overflow-hidden rounded bg-slate-200">
                        <span className="absolute inset-y-0 w-14 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {!isPreviewLoading && (
                isEditing ? (
                  <div className="space-y-4 text-sm">
                    <div>
                      <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                        Tên văn bản / Tiêu đề <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 px-3 py-2 transition-all" 
                        placeholder="Tiêu đề..." 
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                          Số hiệu văn bản <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="text" 
                          className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 px-3 py-2 transition-all" 
                          placeholder="Số hiệu..." 
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                          Ngày ký
                        </label>
                        <input 
                          type="date" 
                          className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all" 
                          value={editSignedDate}
                          onChange={(e) => setEditSignedDate(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                          Đơn vị ban hành
                        </label>
                        <select
                          className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all"
                          value={editUnit}
                          onChange={(e) => setEditUnit(e.target.value)}
                        >
                          <option value="Phòng Đào Tạo">Phòng Đào Tạo</option>
                          <option value="P. CTCT-SV">P. CTCT-SV</option>
                          <option value="Phòng TCCB">Phòng TCCB</option>
                          <option value="Ban Giám Hiệu">Ban Giám Hiệu</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                          Loại văn bản
                        </label>
                        <select
                          className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all"
                          value={editDocumentType}
                          onChange={(e) => setEditDocumentType(e.target.value)}
                        >
                          <option value="Quyết định">Quyết định</option>
                          <option value="Thông báo">Thông báo</option>
                          <option value="Quy chế">Quy chế</option>
                          <option value="Hướng dẫn">Hướng dẫn</option>
                          <option value="Formal document">Formal document</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                        Trích yếu nội dung <span className="text-red-500">*</span>
                      </label>
                      <textarea 
                        className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 resize-none h-28 p-2.5 transition-all" 
                        placeholder="Nhập tóm tắt nội dung chính..." 
                        rows={4}
                        value={editSummary}
                        onChange={(e) => setEditSummary(e.target.value)}
                      ></textarea>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                        Thẻ / Tags (Ngăn cách bằng dấu phẩy)
                      </label>
                      <input 
                        type="text" 
                        className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 px-3 py-2 transition-all" 
                        placeholder="Ví dụ: AI, Học vụ, Tuyển sinh" 
                        value={editTags}
                        onChange={(e) => setEditTags(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <dl className="space-y-4 text-sm">
                    <div className="grid grid-cols-3 gap-4">
                      <dt className="font-medium text-text-secondary">Số hiệu</dt>
                      <dd className="col-span-2 font-mono text-text-main font-medium">{localDoc.code}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <dt className="font-medium text-text-secondary">Loại văn bản</dt>
                      <dd className="col-span-2 text-text-main">{localDoc.documentType}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <dt className="font-medium text-text-secondary">Ngày ban hành</dt>
                      <dd className="col-span-2 text-text-main">{localDoc.signedDate}</dd>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <dt className="font-medium text-text-secondary">Đơn vị soạn thảo</dt>
                      <dd className="col-span-2 text-text-main">{localDoc.unit}</dd>
                    </div>
                    <div className="pt-4 border-t border-border-color">
                      <dt className="font-medium text-text-secondary mb-2">Tóm tắt nội dung</dt>
                      <dd className="text-text-main leading-relaxed text-justify bg-slate-50 p-3 rounded border border-slate-100 text-sm">
                        {localDoc.summary}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-medium text-text-secondary mb-2">Thẻ</dt>
                      <dd className="flex flex-wrap gap-2">
                        {localDoc.tags.map((tag, idx) => (
                          <span key={`${localDoc.id}-preview-tag-${idx}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            {tag}
                          </span>
                        ))}
                      </dd>
                    </div>
                  </dl>
                )
              )}
            </div>

            <div className="p-6 bg-slate-50 border-t border-border-color flex flex-col gap-3">
              {isPreviewLoading ? (
                <>
                  <div className="relative h-11 overflow-hidden rounded-sm border border-slate-300 bg-slate-200">
                    <span className="absolute inset-y-0 w-24 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                  </div>
                  <div className="relative h-11 overflow-hidden rounded-sm border border-slate-200 bg-slate-100">
                    <span className="absolute inset-y-0 w-24 bg-linear-to-r from-transparent via-white/70 to-transparent" style={{ animation: "knowledge-meta-shimmer 1.2s infinite" }} />
                  </div>
                </>
              ) : isEditing ? (
                <div className="flex gap-3">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-text-main border border-slate-300 px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-semibold"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                  >
                    Hủy
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-bold font-heading uppercase tracking-wide disabled:opacity-60 disabled:cursor-not-allowed"
                    onClick={handleSaveChanges}
                    disabled={isSaving || !editTitle.trim() || !editCode.trim() || !editSummary.trim()}
                  >
                    {isSaving ? (
                      <>
                        <span className="material-symbols-outlined text-xl animate-spin">progress_activity</span>
                        <span>Đang lưu...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-xl">save</span>
                        <span>Lưu thay đổi</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-bold font-heading uppercase tracking-wide"
                    onClick={handleStartEditing}
                  >
                    <span className="material-symbols-outlined text-xl">edit</span>
                    <span>Chỉnh sửa thông tin</span>
                  </button>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-text-main border border-slate-300 px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-semibold"
                    onClick={async () => {
                      if (!localDoc) return;
                      try {
                        await knowledgeService.downloadDocumentFile({
                          documentId: localDoc.id,
                          isFormalDoc: localDoc.isFormalDoc,
                          fileName: localDoc.fileName,
                        });
                      } catch {
                        toast.error("Không thể tải file. Vui lòng thử lại.");
                      }
                    }}
                  >
                    <span className="material-symbols-outlined text-xl">download</span>
                    <span>Tải xuống văn bản gốc (PDF)</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
