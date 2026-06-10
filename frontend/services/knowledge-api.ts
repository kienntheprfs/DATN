import { apiClient } from "./auth-api";

export type KnowledgeDocumentClass = "normal" | "formal";

export interface KnowledgeAdminListParams {
  page: number;
  page_size: number;
  search?: string;
  year?: number;
  unit?: string;
  document_type?: string;
  is_formal_doc?: boolean;
  storage_id?: number;
}

export interface KnowledgeAdminDocumentItem {
  id: number;
  title: string;
  status: string | null;
  code: string | null;
  summary: string | null;
  signed_date: string | null;
  unit: string | null;
  document_type: string | null;
  tags: string[];
  is_formal_doc: boolean;
  processing_status: string | null;
  file_size: number | null;
  meta_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeAdminListResponse {
  items: KnowledgeAdminDocumentItem[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

export interface UploadKnowledgeDocumentPayload {
  file: File;
  storageId?: number;
  autoGenerateFaq?: boolean;
  isFormalDoc: boolean;
  metaData?: Record<string, unknown>;
}

export interface UploadKnowledgeDocumentResponse {
  status: "queued";
  document_id: number;
  task_id?: string;
  sync_task_id?: string | null;
  track_id?: string;
  lightrag_doc_id?: string | null;
  is_formal_doc: boolean;
  meta_data?: Record<string, unknown>;
}

export const knowledgeService = {
  async listAdminDocuments(params: KnowledgeAdminListParams): Promise<KnowledgeAdminListResponse> {
    const response = await apiClient.get<KnowledgeAdminListResponse>("/kb/documents/admin/list", {
      params: {
        page: params.page,
        page_size: params.page_size,
        search: params.search || undefined,
        year: params.year ?? undefined,
        unit: params.unit || undefined,
        document_type: params.document_type || undefined,
        is_formal_doc: params.is_formal_doc,
        storage_id: params.storage_id,
      },
    });
    return response.data;
  },

  async deleteDocument(documentId: number, isFormalDoc?: boolean): Promise<void> {
    await apiClient.delete(`/kb/documents/${documentId}`, {
      params: {
        is_formal_doc: isFormalDoc,
      },
    });
  },

  getDocumentFileUrl(documentId: number | string, isFormalDoc?: boolean, download = false): string {
    const params = new URLSearchParams();
    if (typeof isFormalDoc === "boolean") {
      params.set("is_formal_doc", String(isFormalDoc));
    }
    if (download) {
      params.set("download", "true");
    }
    const query = params.toString();
    return query
      ? `/api/kb/documents/${documentId}/file?${query}`
      : `/api/kb/documents/${documentId}/file`;
  },

  async downloadDocumentFile(options: {
    documentId: number | string;
    isFormalDoc?: boolean;
    fileName?: string;
  }): Promise<void> {
    const url = this.getDocumentFileUrl(options.documentId, options.isFormalDoc, true);
    const requestUrl = url.startsWith("/api/") ? url.slice(4) : url;

    const response = await apiClient.get<Blob>(requestUrl, {
      responseType: "blob",
      headers: {
        Accept: "application/pdf,*/*",
      },
    });

    const blobUrl = URL.createObjectURL(response.data);
    try {
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = options.fileName || `document-${options.documentId}`;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  },

  async uploadDocument(payload: UploadKnowledgeDocumentPayload): Promise<UploadKnowledgeDocumentResponse> {
    const formData = new FormData();
    formData.append("file", payload.file);
    formData.append("auto_generate_faq", String(payload.autoGenerateFaq ?? false));
    formData.append("is_formal_doc", String(payload.isFormalDoc));
    if (payload.metaData) {
      formData.append("meta_data_json", JSON.stringify(payload.metaData));
    }

    const response = await apiClient.post<UploadKnowledgeDocumentResponse>("/kb/documents/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  },

  async getDocumentDetail(documentId: number): Promise<KnowledgeAdminDocumentItem> {
    const response = await apiClient.get<KnowledgeAdminDocumentItem>(`/kb/documents/${documentId}`);
    return response.data;
  },
};

export default knowledgeService;
