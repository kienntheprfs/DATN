"use client";

import React, { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Document, DocumentTable } from "./DocumentTable";
import { Pagination } from "./Pagination";
import { KnowledgeFilters } from "./SearchFilterPanel";
import { knowledgeService } from "@/services/knowledge-api";
import { DeletePinModal } from "@/components/admin/pinnedPost/DeletePinModal";

const PAGE_SIZE = 10;

function parseSignedDate(value: string | null | undefined): string {
  if (!value) return "--/--/----";

  const dmyRegex = /^\d{2}\/\d{2}\/\d{4}$/;
  if (dmyRegex.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function mapDocument(item: Awaited<ReturnType<typeof knowledgeService.listAdminDocuments>>["items"][number]): Document {
  const fallbackSummary = item.is_formal_doc
    ? "Tài liệu formal có liên kết và tham chiếu giữa các điều khoản, được xử lý theo pipeline riêng."
    : "Chưa có trích yếu nội dung.";

  return {
    id: String(item.id),
    status: item.status,
    code: item.code || `DOC-${item.id}`,
    title: item.title,
    summary: item.summary || fallbackSummary,
    signedDate: parseSignedDate(item.signed_date),
    unit: item.unit || "--",
    documentType: item.document_type || (item.is_formal_doc ? "Văn bản chính quy" : "Văn bản"),
    tags: item.tags?.length ? item.tags : item.is_formal_doc ? ["Chính quy"] : ["Thường"],
    isFormalDoc: item.is_formal_doc,
    processingStatus: item.processing_status,
    fileName: item.title,
    fileUrl: knowledgeService.getDocumentFileUrl(item.id, item.is_formal_doc, false),
    downloadUrl: knowledgeService.getDocumentFileUrl(item.id, item.is_formal_doc, true),
  };
}

interface KnowledgeDataPanelProps {
  filters: KnowledgeFilters;
  reloadSignal: number;
}

export function KnowledgeDataPanel({ filters, reloadSignal }: KnowledgeDataPanelProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteCandidate, setDeleteCandidate] = useState<Document | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async (doc: Document) => {
      await knowledgeService.deleteDocument(Number(doc.id), doc.isFormalDoc);
    },
    onMutate: async (doc) => {
      await queryClient.cancelQueries({ queryKey: ["admin-knowledge-documents"] });
      const previousQueries = queryClient.getQueriesData({ queryKey: ["admin-knowledge-documents"] });
      queryClient.setQueriesData({ queryKey: ["admin-knowledge-documents"] }, (old: unknown) => {
        if (!old || typeof old !== "object" || !("items" in old)) return old;
        const data = old as { items: Array<{ id: number } & Record<string, unknown>> };
        return {
          ...data,
          items: data.items.map((item) =>
            item.id === Number(doc.id) ? { ...item, status: "delete_pending" } : item
          ),
        };
      });
      return { previousQueries };
    },
    onError: (error: unknown, _doc, context) => {
      if (context?.previousQueries) {
        for (const [key, data] of context.previousQueries) {
          queryClient.setQueryData(key, data);
        }
      }
      const message = error instanceof Error ? error.message : "Không thể xóa tài liệu.";
      toast.error(message);
    },
    onSuccess: () => {
      toast.success("Đã xóa tài liệu thành công.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-documents"] });
    },
  });

  const listQuery = useQuery({
    queryKey: ["admin-knowledge-documents", filters, currentPage, reloadSignal],
    queryFn: () =>
      knowledgeService.listAdminDocuments({
        page: currentPage,
        page_size: PAGE_SIZE,
        search: filters.search.trim() || undefined,
        year: filters.year !== "all" ? Number(filters.year) : undefined,
        unit: filters.unit !== "all" ? filters.unit : undefined,
        document_type: filters.documentType !== "all" ? filters.documentType : undefined,
        is_formal_doc:
          filters.docClass === "all"
            ? undefined
            : filters.docClass === "formal"
              ? true
              : false,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data || !("items" in data)) return false;
      const needsPoll = (data as { items: Array<{ processing_status?: string | null; status?: string | null }> }).items.some(
        (item) =>
          item.processing_status === "pending" ||
          item.processing_status === "processing" ||
          item.status === "delete_pending"
      );
      return needsPoll ? 3000 : false;
    },
  });

  const documents = useMemo(() => {
    return (listQuery.data?.items ?? []).map(mapDocument);
  }, [listQuery.data]);

  const totalItems = listQuery.data?.total_items ?? 0;
  const totalPages = Math.max(1, listQuery.data?.total_pages ?? 0);

  return (
    <div className="bg-surface rounded-md border border-border-color shadow-sm flex flex-col overflow-visible md:flex-1 md:overflow-hidden">
      {listQuery.isError && (
        <div className="mx-4 mt-4 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Không thể tải danh sách văn bản. Vui lòng thử lại.
          <button
            type="button"
            onClick={() => {
              toast.info("Đang tải lại danh sách văn bản...");
              listQuery.refetch();
            }}
            className="ml-3 font-semibold underline decoration-red-400 underline-offset-2"
          >
            Tải lại
          </button>
        </div>
      )}

      <DocumentTable
        documents={documents}
        isLoading={listQuery.isPending}
        deletingDocumentId={deleteMutation.variables?.id}
        onDeleteDocument={setDeleteCandidate}
      />
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={PAGE_SIZE}
        onPageChange={setCurrentPage}
      />

      <DeletePinModal
        open={Boolean(deleteCandidate)}
        pinTitle={deleteCandidate?.title}
        isDeleting={deleteMutation.isPending}
        title="Xác nhận xóa tài liệu"
        description={deleteCandidate ? `Bạn có chắc chắn muốn xóa tài liệu \"${deleteCandidate.title}\"? Hành động này không thể hoàn tác.` : undefined}
        confirmLabel="Xóa tài liệu"
        loadingLabel="Đang xóa tài liệu..."
        onCancel={() => {
          if (!deleteMutation.isPending) {
            setDeleteCandidate(null);
          }
        }}
        onConfirm={() => {
          if (deleteCandidate) {
            deleteMutation.mutate(deleteCandidate, {
              onSuccess: () => {
                setDeleteCandidate(null);
              },
            });
          }
        }}
      />
    </div>
  );
}
