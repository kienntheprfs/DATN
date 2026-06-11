"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import { knowledgeService, KnowledgeAdminDocumentItem } from "@/services/knowledge-api";
import { UploadModal } from "@/components/admin/knowledge/UploadModal";
import { DocumentPreviewModal } from "@/components/admin/knowledge/DocumentPreviewModal";
import type { Document } from "@/components/admin/knowledge/DocumentTable";
import { toast } from "sonner";

interface KnowledgeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  topicTitle: string;
  linkedDocIds: number[];
  onLinkDoc: (docId: number) => void;
  onUnlinkDoc: (docId: number) => void;
  isConfirmed: boolean;
  onConfirm: () => void;
  onUnconfirm: () => void;
}

export function KnowledgeDrawer({
  isOpen,
  onClose,
  topicTitle,
  linkedDocIds = [],
  onLinkDoc,
  onUnlinkDoc,
  isConfirmed,
  onConfirm,
  onUnconfirm,
}: KnowledgeDrawerProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const PAGE_SIZE = 5;

  const mapToPreviewDocument = (doc: KnowledgeAdminDocumentItem): Document => ({
    id: String(doc.id),
    status: doc.status,
    processingStatus: doc.processing_status,
    code: doc.code || "",
    title: doc.title,
    summary: doc.summary || "",
    signedDate: doc.signed_date || "",
    unit: doc.unit || "",
    documentType: doc.document_type || "Khác",
    tags: doc.tags || [],
    isFormalDoc: doc.is_formal_doc,
    fileName: doc.title,
    fileUrl: knowledgeService.getDocumentFileUrl(doc.id, doc.is_formal_doc, false),
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Fetch available documents from system library with caching matching the knowledge page
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-knowledge-documents", debouncedSearch, page],
    queryFn: () =>
      knowledgeService.listAdminDocuments({
        page,
        page_size: PAGE_SIZE,
        search: debouncedSearch,
      }),
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const availableDocs = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;

  // Fetch detailed info for linked document IDs using useQueries with caching
  const linkedDocsQueries = useQueries({
    queries: (linkedDocIds || []).map((id) => ({
      queryKey: ["admin-knowledge-document", id],
      queryFn: () => knowledgeService.getDocumentDetail(id),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    })),
  });

  const linkedDocs = linkedDocsQueries
    .map((q) => q.data)
    .filter((doc): doc is KnowledgeAdminDocumentItem => !!doc);
  const isLoadingLinkedDocs = linkedDocsQueries.some((q) => q.isLoading);

  // Auto-link latest document if user just uploaded
  const handleUploaded = async () => {
    // Refresh search results
    await refetch();
    // Invalidate knowledge queries
    queryClient.invalidateQueries({ queryKey: ["admin-knowledge-documents"] });
    
    // UI-only: fetch the absolute latest document in library and auto-link it as evidence
    try {
      const latestRes = await knowledgeService.listAdminDocuments({
        page: 1,
        page_size: 1,
      });
      if (latestRes.items && latestRes.items.length > 0) {
        const latestDoc = latestRes.items[0];
        // Only auto-link if it's not already linked
        if (!(linkedDocIds || []).includes(latestDoc.id)) {
          onLinkDoc(latestDoc.id);
          toast.success(`Đã tự động liên kết tài liệu vừa tải lên: ${latestDoc.title}`);
        }
      }
    } catch (e) {
      console.error("Auto-link failed:", e);
    }
  };

  return (
    <>
      <div
        className={`topic-drawer-container absolute right-0 top-0 bottom-0 z-40 flex flex-col border-l border-border-color bg-white shadow-2xl transition-all duration-300 ease-in-out font-sans ${
          isOpen ? "translate-x-0 w-full sm:w-[480px]" : "translate-x-full pointer-events-none w-0"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-6 py-4">
          <div>
            <h1 className="font-heading text-lg font-bold text-slate-800">
              Minh chứng Tri thức
            </h1>
            <div className="text-sm font-semibold text-slate-800 mt-1 line-clamp-1" title={topicTitle}>
              Chủ đề: {topicTitle.replace(/_/g, " ")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Status block */}
          <div className="rounded-sm border p-4 bg-slate-50 border-border-color flex items-center justify-between">
            <div>
              <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Trạng thái chủ đề</span>
              <div className="mt-1 flex items-center gap-1.5">
                {isConfirmed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-600">
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    Đã cập nhật tri thức
                  </span>
                ) : linkedDocIds.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-600">
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    Đang xử lý
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-amber-600">
                    <span className="material-symbols-outlined text-sm">hourglass_empty</span>
                    Chờ xử lý
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold uppercase tracking-wider text-slate-700">Đã liên kết</span>
              <p className="text-xl font-extrabold text-slate-900">{linkedDocIds.length} tài liệu</p>
            </div>
          </div>

          {/* Linked Documents List */}
          <div>
            <h4 className="font-heading text-base font-bold text-slate-900 uppercase tracking-wide mb-3 flex items-center justify-between">
              <span>Tài liệu đã đính kèm</span>
              {/* <span className="text-sm font-bold text-slate-700 normal-case">({linkedDocIds.length})</span> */}
            </h4>

            {isLoadingLinkedDocs && linkedDocs.length === 0 ? (
              <div className="space-y-2 py-4 animate-pulse">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-sm" />
                ))}
              </div>
            ) : linkedDocs.length === 0 ? (
              <div className="rounded-sm border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
                <span className="material-symbols-outlined text-4xl text-slate-300">link_off</span>
                <p className="text-base font-semibold text-slate-800 mt-2">Chưa có tài liệu minh chứng nào được liên kết.</p>
                <p className="text-sm font-semibold text-slate-700 mt-1">Chọn tài liệu từ thư viện bên dưới để đính kèm.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {linkedDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 border border-border-color bg-white rounded-sm shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="material-symbols-outlined text-primary text-[20px] mt-0.5 shrink-0">
                        {doc.is_formal_doc ? "gavel" : "description"}
                      </span>
                      <div className="min-w-0">
                        <p 
                          onClick={() => setPreviewDoc(mapToPreviewDocument(doc))}
                          className="text-sm font-bold text-slate-900 hover:text-primary hover:underline cursor-pointer truncate" 
                          title={`Xem chi tiết tài liệu: ${doc.title}`}
                        >
                          {doc.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {doc.code && (
                            <span className="text-[11px] font-mono bg-slate-100 px-1 rounded text-slate-700 font-bold truncate max-w-[150px]">
                              {doc.code}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-700">
                            {doc.is_formal_doc ? "Formal doc" : "Normal doc"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        isConfirmed 
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                          : "bg-blue-50 text-blue-700 border-blue-200"
                      }`}>
                        {isConfirmed ? "Đã cập nhật tri thức" : "Đang xử lý"}
                      </span>
                      {!isConfirmed && (
                        <button
                          onClick={() => onUnlinkDoc(doc.id)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500 transition-colors"
                          title="Gỡ liên kết"
                        >
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Evidence Section */}
          <div className="border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-heading text-base font-bold text-slate-900 uppercase tracking-wide">
                Thư viện tài liệu sẵn có
              </h4>
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center gap-1 text-sm font-bold text-primary hover:text-blue-800 hover:underline"
              >
                <span className="material-symbols-outlined text-[16px]">upload_file</span>
                Tải văn bản mới
              </button>
            </div>

            {/* Search Input */}
            <div className="relative mb-4">
              <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
                search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tài liệu theo tiêu đề, số hiệu..."
                className="w-full rounded-sm border border-border-color bg-slate-50 py-2 pl-9 pr-4 text-sm font-semibold text-slate-800 transition-all outline-none focus:border-primary focus:bg-white"
              />
            </div>

            {/* Library list */}
            {isLoading ? (
              <div className="space-y-2 py-4 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 rounded-sm" />
                ))}
              </div>
            ) : availableDocs.length === 0 ? (
              <div className="text-center py-8 text-slate-800 text-base font-bold border border-dashed border-slate-200 rounded-sm bg-slate-50">
                Không tìm thấy tài liệu phù hợp.
              </div>
            ) : (
              <div className="space-y-2">
                {availableDocs.map((doc) => {
                  const isLinked = (linkedDocIds || []).includes(doc.id);
                  return (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between p-2.5 border border-slate-100 bg-slate-50/50 rounded-sm text-sm"
                    >
                      <div className="min-w-0 pr-3 flex-1">
                        <p 
                          onClick={() => setPreviewDoc(mapToPreviewDocument(doc))}
                          className="font-bold text-slate-800 hover:text-primary hover:underline cursor-pointer truncate text-sm" 
                          title={`Xem chi tiết tài liệu: ${doc.title}`}
                        >
                          {doc.title}
                        </p>
                        <p className="text-xs font-bold text-slate-700 mt-0.5 truncate">
                          {doc.code ? `Số: ${doc.code} | ` : ""}{doc.unit || "Thư viện"}
                        </p>
                      </div>

                      <button
                        disabled={isLinked || isConfirmed}
                        onClick={() => onLinkDoc(doc.id)}
                        className={`shrink-0 flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-sm border transition-all ${
                          isLinked
                            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                            : "bg-white text-primary border-primary hover:bg-blue-50"
                        }`}
                      >
                        {isLinked ? (
                          <>
                            <span className="material-symbols-outlined text-[14px]">check</span>
                            Đã gán
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-[14px]">link</span>
                            Liên kết
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}

                {/* Library Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 mt-3 text-xs">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="font-bold text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:underline"
                    >
                      ← Trước
                    </button>
                    <span className="text-slate-500 font-medium">{page} / {totalPages}</span>
                    <button
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="font-bold text-primary disabled:opacity-50 disabled:cursor-not-allowed hover:underline"
                    >
                      Sau →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-border-color bg-slate-50 px-6 py-4 flex gap-3 shrink-0 font-sans">
          <button
            onClick={onClose}
            className="flex-1 rounded-sm border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Đóng
          </button>
          
          {isConfirmed ? (
            <button
              onClick={onUnconfirm}
              className="flex-1 rounded-sm border border-red-300 bg-red-50 py-2 text-sm font-bold text-red-600 shadow-sm hover:bg-red-100 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">bookmark_remove</span>
              Bỏ cập nhật tri thức
            </button>
          ) : (
            <button
              disabled={linkedDocIds.length === 0}
              onClick={onConfirm}
              className={`flex-[2] flex items-center justify-center gap-2 rounded-sm py-2 text-sm font-bold text-white shadow-md transition-colors cursor-pointer ${
                linkedDocIds.length === 0
                  ? "bg-slate-300 cursor-not-allowed"
                  : "bg-primary hover:bg-blue-800"
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">task_alt</span>
              Xác nhận cập nhật tri thức
            </button>
          )}
        </div>
      </div>

      {/* Upload Modal Overlay */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploaded={handleUploaded}
      />

      {/* Document Preview Modal */}
      {previewDoc && (
        <DocumentPreviewModal
          document={previewDoc}
          onClose={() => setPreviewDoc(null)}
        />
      )}
    </>
  );
}
