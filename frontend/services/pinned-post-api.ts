import { apiClient } from "./auth-api";

export type PinnedPostCategory =
  | "Quy chế Đào tạo"
  | "Sau Đại học"
  | "Công tác Sinh viên"
  | "Nghiên cứu Khoa học";

export type PinnedPostSortBy = "latest" | "manual" | "alphabetical";

export interface PinnedPostPayload {
  title: string;
  summary: string;
  document_type: string;
  source_url: string;
  category: PinnedPostCategory;
  tags?: string[];
}

export interface PinnedPostItemResponse {
  id: string;
  order: number;
  title: string;
  ref_id: string;
  category: PinnedPostCategory;
  pinned_date: string;
  summary: string;
  source_url: string;
  document_type: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface PinnedPostStatsResponse {
  total_pins: number;
  active_slots: number;
  max_slots: number;
  top_category: PinnedPostCategory | null;
  last_updated_date: string | null;
}

export interface PinnedPostListParams {
  page: number;
  page_size: number;
  search?: string;
  category?: PinnedPostCategory;
  sort_by?: PinnedPostSortBy;
}

export interface PinnedPostListResponse {
  items: PinnedPostItemResponse[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  stats: PinnedPostStatsResponse;
}

export interface PinnedPostPublicListResponse {
  items: PinnedPostItemResponse[];
  total_items: number;
}

export interface PinnedPostReorderPayload {
  ordered_post_ids: string[];
}

export interface PinnedPostReorderResponse {
  items: PinnedPostItemResponse[];
}

export const pinnedPostService = {
  async listAdmin(params: PinnedPostListParams): Promise<PinnedPostListResponse> {
    const response = await apiClient.get<PinnedPostListResponse>("/dashboard/pinned-posts/admin", {
      params: {
        page: params.page,
        page_size: params.page_size,
        search: params.search || undefined,
        category: params.category || undefined,
        sort_by: params.sort_by || undefined,
      },
    });
    return response.data;
  },

  async listPublic(params?: {
    limit?: number;
    sort_by?: PinnedPostSortBy;
  }): Promise<PinnedPostPublicListResponse> {
    const response = await apiClient.get<PinnedPostPublicListResponse>("/dashboard/pinned-posts", {
      params: {
        limit: params?.limit ?? 50,
        sort_by: params?.sort_by ?? "manual",
      },
    });
    return response.data;
  },

  async create(payload: PinnedPostPayload): Promise<PinnedPostItemResponse> {
    const response = await apiClient.post<PinnedPostItemResponse>("/dashboard/pinned-posts", payload);
    return response.data;
  },

  async update(id: string, payload: PinnedPostPayload): Promise<PinnedPostItemResponse> {
    const response = await apiClient.put<PinnedPostItemResponse>(`/dashboard/pinned-posts/${id}`, payload);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await apiClient.delete(`/dashboard/pinned-posts/${id}`);
  },

  async reorder(payload: PinnedPostReorderPayload): Promise<PinnedPostReorderResponse> {
    const response = await apiClient.put<PinnedPostReorderResponse>("/dashboard/pinned-posts/reorder", payload);
    return response.data;
  },
};

export default pinnedPostService;
