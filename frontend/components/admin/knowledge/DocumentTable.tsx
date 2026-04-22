"use client";

import React, { useState } from "react";
import Link from "next/link";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { knowledgeService } from "@/services/knowledge-api";
import { toast } from "sonner";

export interface Document {
  id: string;
  status?: string | null;
  code: string;
  title: string;
  summary: string;
  signedDate: string;
  unit: string;
  documentType: "Quyết định" | "Thông báo" | "Quy chế" | "Hướng dẫn" | string;
  tags: string[];
  isFormalDoc?: boolean;
  fileName?: string;
  fileUrl?: string;
  downloadUrl?: string;
}

interface DocumentTableProps {
  documents: Document[];
  isLoading?: boolean;
  onDeleteDocument?: (document: Document) => void;
  deletingDocumentId?: string;
}

const typeStyles: Record<string, string> = {
  "Quyết định": "bg-blue-50 text-blue-800 border-blue-100",
  "Thông báo": "bg-amber-50 text-amber-800 border-amber-100",
  "Quy chế": "bg-purple-50 text-purple-800 border-purple-100",
  "Hướng dẫn": "bg-emerald-50 text-emerald-800 border-emerald-100",
};

export function DocumentTable({ documents, isLoading, onDeleteDocument, deletingDocumentId }: DocumentTableProps) {
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);

  const handleOpenPreview = (doc: Document) => {
    setPreviewDoc(doc);
  };

  const handleClosePreview = () => {
    setPreviewDoc(null);
  };

  return (
    <>
      <div className="overflow-visible border border-border-color rounded-md bg-surface shadow-subtle relative md:overflow-auto md:flex-1 md:min-h-0">
        <div className="min-w-250 w-full block">
          <TooltipProvider delayDuration={250}>
            <table className="w-full divide-y divide-border-color">
              <thead className="bg-slate-50 sticky -top-4 md:top-0 z-10">
                <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-35">Số hiệu / ID</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading">Trích yếu nội dung</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-35">Ngày ký</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-45">Đơn vị</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-30">Loại</th>
            <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-45">Thẻ / Tags</th>
            <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-22">
              Hành động
            </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-border-color">
          {isLoading ? (
            <tr className="animate-pulse dense-table-row">
              <td className="px-6 whitespace-nowrap align-top">
                <div className="h-5 bg-slate-200 rounded w-20"></div>
              </td>
              <td className="px-6 align-top">
                <div className="h-5 bg-slate-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-slate-100 rounded w-1/2"></div>
              </td>
              <td className="px-6 whitespace-nowrap align-top">
                <div className="h-4 bg-slate-200 rounded w-20"></div>
              </td>
              <td className="px-6 whitespace-nowrap align-top">
                <div className="h-4 bg-slate-200 rounded w-24"></div>
              </td>
              <td className="px-6 whitespace-nowrap align-top">
                <div className="h-5 bg-slate-200 rounded w-16"></div>
              </td>
              <td className="px-6 align-top">
                <div className="flex gap-2">
                  <div className="h-5 bg-slate-200 rounded w-12"></div>
                  <div className="h-5 bg-slate-200 rounded w-16"></div>
                </div>
              </td>
              <td className="px-6 whitespace-nowrap text-right align-top">
                <div className="inline-flex items-center justify-end gap-2">
                  <div className="h-5 w-5 rounded bg-slate-200"></div>
                  <div className="h-5 w-5 rounded bg-slate-200"></div>
                  <div className="h-5 w-5 rounded bg-slate-200"></div>
                </div>
              </td>
            </tr>
          ) : documents.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-8 text-center text-text-secondary">
                Không có dữ liệu
              </td>
            </tr>
          ) : (
            documents.map((doc) => (
              <tr 
                key={doc.id} 
                className="hover:bg-slate-50 transition-colors group dense-table-row cursor-pointer"
                onClick={() => handleOpenPreview(doc)}
              >
                <td className="px-6 whitespace-nowrap align-top">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs font-mono text-text-secondary bg-slate-100 px-1.5 py-0.5 rounded inline-block border border-slate-200 max-w-30 truncate">
                        {doc.code}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>{doc.code}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-6 align-top">
                  <div className="flex flex-col gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link href="#" className="text-sm font-semibold text-primary hover:underline hover:text-blue-800 leading-snug line-clamp-1" onClick={(e) => e.preventDefault()}>
                          {doc.title}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>{doc.title}</TooltipContent>
                    </Tooltip>
                    <p className="text-xs text-text-secondary line-clamp-1">{doc.summary}</p>
                  </div>
                </td>
                <td className="px-6 whitespace-nowrap align-top">
                  <div className="text-sm text-text-main font-mono">{doc.signedDate}</div>
                </td>
                <td className="px-6 whitespace-nowrap align-top">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-sm text-text-main max-w-44 truncate">{doc.unit}</div>
                    </TooltipTrigger>
                    <TooltipContent>{doc.unit}</TooltipContent>
                  </Tooltip>
                </td>
                <td className="px-6 whitespace-nowrap align-top">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${typeStyles[doc.documentType] || "bg-slate-50 text-slate-800 border-slate-100"}`}>
                    {doc.isFormalDoc ? <span className="material-symbols-outlined text-[12px]">gavel</span> : null}
                    {doc.documentType}
                  </span>
                </td>
                <td className="px-6 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {doc.tags.map((tag, idx) => (
                      <span key={idx} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-6 whitespace-nowrap text-right text-sm font-medium align-top">
                  {(() => {
                    const isDeletePending = doc.status === "delete_pending";
                    const isDeleteFailed = doc.status === "delete_failed";
                    const isDeletingNow = deletingDocumentId === doc.id;
                    const deleteIcon = isDeletePending || isDeletingNow
                      ? "hourglass_top"
                      : isDeleteFailed
                        ? "refresh"
                        : "delete";
                    const deleteTitle = isDeletePending
                      ? "Đang chờ xóa tài liệu"
                      : isDeleteFailed
                        ? "Xóa thất bại, bấm để thử lại"
                        : "Xóa tài liệu";
                    const deleteButtonClass = isDeletePending
                      ? "text-amber-600 transition-colors"
                      : isDeleteFailed
                        ? "text-orange-500 hover:text-orange-700 transition-colors"
                        : "text-slate-400 hover:text-red-600 transition-colors";

                    return (
                  <div className={`${isDeletePending ? "visible" : "invisible group-hover:visible"} flex items-center justify-end gap-2`}>
                    <button
                      className="text-slate-400 hover:text-primary transition-colors"
                      title="Xem chi tiết"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenPreview(doc);
                      }}
                    >
                      <span className="material-symbols-outlined text-xl">visibility</span>
                    </button>
                    <button 
                      className="text-slate-400 hover:text-primary transition-colors" 
                      title="Tải xuống"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await knowledgeService.downloadDocumentFile({
                            documentId: doc.id,
                            isFormalDoc: doc.isFormalDoc,
                            fileName: doc.fileName,
                          });
                        } catch {
                          toast.error("Không thể tải file. Vui lòng thử lại.");
                        }
                      }}
                    >
                      <span className="material-symbols-outlined text-xl">download</span>
                    </button>
                    <button
                      className={deleteButtonClass}
                      title={deleteTitle}
                      disabled={isDeletePending || isDeletingNow}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isDeletePending) {
                          toast.info("Tài liệu đang chờ xóa. Vui lòng đợi xử lý hoàn tất.");
                          return;
                        }
                        onDeleteDocument?.(doc);
                      }}
                    >
                      <span className="material-symbols-outlined text-xl">
                        {deleteIcon}
                      </span>
                    </button>
                  </div>
                    );
                  })()}
                </td>
              </tr>
            ))
          )}
              </tbody>
            </table>
          </TooltipProvider>
        </div>
      </div>

      <DocumentPreviewModal 
        document={previewDoc} 
        onClose={handleClosePreview} 
      />
    </>
  );
}

