"use client";

import React from "react";
import { Document } from "./DocumentTable";
import { PdfPreviewPanel } from "./PdfPreviewPanel";
import { knowledgeService } from "@/services/knowledge-api";
import { toast } from "sonner";

interface DocumentPreviewModalProps {
  document: Document | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  const [isPreviewLoading, setIsPreviewLoading] = React.useState(true);

  React.useEffect(() => {
    if (!document) {
      return;
    }
    setIsPreviewLoading(true);
  }, [document]);

  if (!document) return null;

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
              <h2 className="text-base font-heading font-bold text-text-main">{document.title}</h2>
              <p className="text-xs text-text-secondary">Văn bản gốc • Xem trước</p>
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
              file={document.fileUrl || null}
              fileName={document.fileName || document.title}
              className="w-full"
              onLoadingStateChange={setIsPreviewLoading}
            />
          </div>

          {/* Right Panel - Info & Actions */}
          <div className="w-full lg:w-5/12 bg-surface flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-heading font-bold text-text-main mb-4 uppercase tracking-wider border-b border-border-color pb-2">Thông tin văn bản</h3>

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

              <dl className={`space-y-4 text-sm ${isPreviewLoading ? "hidden" : "block"}`}>
                <div className="grid grid-cols-3 gap-4">
                  <dt className="font-medium text-text-secondary">Số hiệu</dt>
                  <dd className="col-span-2 font-mono text-text-main font-medium">{document.code}</dd>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <dt className="font-medium text-text-secondary">Loại văn bản</dt>
                  <dd className="col-span-2 text-text-main">{document.documentType}</dd>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <dt className="font-medium text-text-secondary">Ngày ban hành</dt>
                  <dd className="col-span-2 text-text-main">{document.signedDate}</dd>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <dt className="font-medium text-text-secondary">Đơn vị soạn thảo</dt>
                  <dd className="col-span-2 text-text-main">{document.unit}</dd>
                </div>
                <div className="pt-4 border-t border-border-color">
                  <dt className="font-medium text-text-secondary mb-2">Tóm tắt nội dung</dt>
                  <dd className="text-text-main leading-relaxed text-justify bg-slate-50 p-3 rounded border border-slate-100 text-sm">
                    {document.summary}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-text-secondary mb-2">Thẻ</dt>
                  <dd className="flex flex-wrap gap-2">
                    {document.tags.map((tag, idx) => (
                      <span key={`${document.id}-preview-tag-${idx}`} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {tag}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
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
              ) : (
                <>
                  <button className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-bold font-heading uppercase tracking-wide">
                    <span className="material-symbols-outlined text-xl">smart_toy</span>
                    <span>Mở trong trình xem AI</span>
                  </button>
                  <button
                    className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-text-main border border-slate-300 px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-semibold"
                    onClick={async () => {
                      try {
                        await knowledgeService.downloadDocumentFile({
                          documentId: document.id,
                          isFormalDoc: document.isFormalDoc,
                          fileName: document.fileName,
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
