import { apiClient } from "./auth-api";

const FAQ_API_URL = '/kb/faqs';

export interface FAQQuestion {
  id: number;
  question: string;
  embedding_id: string;
}

export interface FAQ {
  id: number;
  source: string;
  document_id: number | null;
  answer: string;
  meta_data: Record<string, unknown> | null;
  questions: FAQQuestion[];
  created_at: string;
  updated_at: string;
}

export interface FAQListResponse {
  items: FAQ[];
  total: number;
  skip: number;
  limit: number;
}

export interface CreateFAQPayload {
  answer: string;
  questions: string[];
  meta_data?: Record<string, unknown>;
}

export interface UpdateFAQPayload {
  answer?: string;
  meta_data?: Record<string, unknown>;
}

export const faqApi = {
  list: async (params: { skip?: number; limit?: number } = {}): Promise<FAQListResponse> => {
    const { skip = 0, limit = 50 } = params;
    console.log('[FAQ API] GET /faqs', { skip, limit });
    const response = await apiClient.get<FAQ[]>(FAQ_API_URL, {
      params: { skip, limit },
    });
    return {
      items: response.data,
      total: response.data.length,
      skip,
      limit,
    };
  },

  get: async (id: number): Promise<FAQ> => {
    console.log('[FAQ API] GET /faqs/:id', { id });
    const response = await apiClient.get<FAQ>(`${FAQ_API_URL}/${id}`);
    return response.data;
  },

  create: async (payload: CreateFAQPayload): Promise<FAQ> => {
    console.log('[FAQ API] POST /faqs', payload);
    const response = await apiClient.post<FAQ>(FAQ_API_URL, payload);
    return response.data;
  },

  update: async (id: number, payload: UpdateFAQPayload): Promise<FAQ> => {
    console.log('[FAQ API] PATCH /faqs/:id', { id, payload });
    const response = await apiClient.patch<FAQ>(`${FAQ_API_URL}/${id}`, payload);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    console.log('[FAQ API] DELETE /faqs/:id', { id });
    await apiClient.delete(`${FAQ_API_URL}/${id}`);
  },
};

export default faqApi;