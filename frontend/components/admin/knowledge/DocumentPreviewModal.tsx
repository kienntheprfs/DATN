"use client";

import React from "react";
import { Document } from "./DocumentTable";

interface DocumentPreviewModalProps {
  document: Document | null;
  onClose: () => void;
}

export function DocumentPreviewModal({ document, onClose }: DocumentPreviewModalProps) {
  if (!document) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity cursor-pointer" onClick={onClose} aria-hidden="true" />

      <div className="relative w-full max-w-5xl bg-surface rounded-sm shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/10 border border-slate-200" style={{ height: "85vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-slate-50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-xl">description</span>
            </div>
            <div>
              <h2 className="text-base font-heading font-bold text-text-main">{document.title}</h2>
              <p className="text-xs text-text-secondary">Văn bản gốc • Xem trước trang đầu</p>
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
            <div className="bg-white w-full max-w-150 min-h-155 md:min-h-200 shadow-lg border border-slate-300 p-6 md:p-8 text-xs text-justify leading-relaxed font-serif text-slate-800 select-none relative">
              <div className="flex flex-col items-center mb-8 gap-1">
                <p className="uppercase font-bold text-xs">ĐẠI HỌC QUỐC GIA TP.HCM</p>
                <p className="uppercase font-bold text-xs">TRƯỜNG ĐẠI HỌC BÁCH KHOA</p>
                <div className="w-16 h-px bg-black my-1" />
                <p className="italic">Số: {document.code}</p>
              </div>

              <div className="flex flex-col items-center mb-8">
                <h1 className="uppercase font-bold text-sm text-center mb-2">{document.type}</h1>
                <p className="font-bold text-center w-3/4">{document.title}</p>
              </div>

              <p className="mb-4 indent-8">Căn cứ quy định hiện hành của Trường Đại học Bách Khoa và các văn bản pháp lý liên quan;</p>
              <p className="mb-4 indent-8">Xét đề nghị của đơn vị chức năng, nhằm chuẩn hóa hoạt động học thuật và hành chính;</p>
              <p className="mb-4 indent-8">Nhằm đảm bảo quy trình triển khai minh bạch, đồng bộ và hiệu quả trong toàn trường;</p>
              <p className="mb-4 indent-8">Xét đề nghị của {document.unit},</p>

              <div className="my-8 flex flex-col items-center">
                <p className="uppercase font-bold text-sm tracking-widest">QUYẾT ĐỊNH:</p>
              </div>

              <p className="mb-2"><strong>Điều 1.</strong> Ban hành văn bản này để làm căn cứ thực hiện trong phạm vi toàn trường.</p>
              <p className="mb-2"><strong>Điều 2.</strong> Quyết định có hiệu lực kể từ ngày ký và được áp dụng theo đúng nội dung kèm theo.</p>

              <div className="absolute bottom-0 left-0 w-full h-32 bg-linear-to-t from-white to-transparent" />
            </div>
          </div>

          {/* Right Panel - Info & Actions */}
          <div className="w-full lg:w-5/12 bg-surface flex flex-col h-full">
            <div className="flex-1 overflow-y-auto p-6">
              <h3 className="text-sm font-heading font-bold text-text-main mb-4 uppercase tracking-wider border-b border-border-color pb-2">Thông tin văn bản</h3>

              <dl className="space-y-4 text-sm">
                <div className="grid grid-cols-3 gap-4">
                  <dt className="font-medium text-text-secondary">Số hiệu</dt>
                  <dd className="col-span-2 font-mono text-text-main font-medium">{document.code}</dd>
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
              <button className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-bold font-heading uppercase tracking-wide">
                <span className="material-symbols-outlined text-xl">smart_toy</span>
                <span>Mở trong trình xem AI</span>
              </button>
              <button className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-text-main border border-slate-300 px-4 py-2.5 rounded-sm shadow-sm transition-colors text-sm font-semibold">
                <span className="material-symbols-outlined text-xl">download</span>
                <span>Tải xuống văn bản gốc (PDF)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
