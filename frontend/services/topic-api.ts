/**
 * topic-api.ts
 * All API calls for the Admin Topic Pipeline page.
 * Uses the shared `apiClient` (Axios + auth interceptors) from auth-api.ts.
 */

import { apiClient } from "./auth-api";

// ---------------------------------------------------------------------------
// Enums mirroring backend
// ---------------------------------------------------------------------------

export type TopicType = "missing_knowledge" | "popular_questions";
export type TimeRange = "24h" | "7d" | "14d" | "30d";
export type TrendView = "day" | "week" | "month";
export type JobStatus = "pending" | "running" | "succeeded" | "failed";
export type JobStage =
  | "pending"
  | "loading_input"
  | "modeling"
  | "exporting_file"
  | "exporting_db"
  | "completed";

// ---------------------------------------------------------------------------
// Job schemas — a job no longer has topic_type (it runs all sources)
// ---------------------------------------------------------------------------

export interface JobTriggerRequest {
  time_range: TimeRange;
}

export interface JobTriggerResponse {
  id: string;
  time_range: TimeRange;
  status: JobStatus;
  stage: JobStage;
  progress: number;
  message: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobDetailResponse extends JobTriggerResponse {
  error_detail: string | null;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Topic list schemas
// ---------------------------------------------------------------------------

export interface TopicSentiment {
  positive: number;
  neutral: number;
}

export interface TopicSourceItem {
  label: string;
  percent: string;
}

export interface TopicListItem {
  topic_id: number;
  result_id: string;
  topic_type: TopicType;
  title: string;
  summary: string;
  queries: number;
  status: "new" | "stable" | "waiting";
  pinned: boolean;
  knowledge_updated: boolean;
  discarded: boolean;
  evidence_document_ids: number[];
  pinned_post_ids: string[];
  featured_entity: string;
  featured_entity_rate: number;
  confidence: number;
  sync_ago: string;
  tags: string[];
  sources: TopicSourceItem[];
  sentiment: TopicSentiment;
  created_at: string;
}

export interface TopicListResponse {
  result_id: string;
  topic_type: string;
  time_range: string;
  total_topics: number;
  total_documents: number;
  items: TopicListItem[];
  created_at: string;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export interface TopicQuestionItem {
  id: string;
  question: string;
  topic_id: number;
  label: string | null;
  source: string | null;
  created_at: string;
}

export interface TopicQuestionsResponse {
  items: TopicQuestionItem[];
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Trend
// ---------------------------------------------------------------------------

export interface TrendDataPoint {
  period: string;
  count: number;
}

export interface TopicTrendResponse {
  topic_id: number;
  result_id: string;
  topic_type: string;
  view: TrendView;
  data: TrendDataPoint[];
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

export interface TopicKeywordItem {
  term: string;
  score: number;
}

export interface TopicKeywordsResponse {
  topic_id: number;
  result_id: string;
  keywords: TopicKeywordItem[];
}

// ---------------------------------------------------------------------------
// Pin
// ---------------------------------------------------------------------------

export interface TopicPinRequest {
  pinned?: boolean;
  knowledge_updated?: boolean;
  discarded?: boolean;
  evidence_document_ids?: number[];
  pinned_post_ids?: string[];
}

export interface TopicPinResponse {
  result_id: string;
  topic_id: number;
  pinned: boolean;
  knowledge_updated: boolean;
  discarded: boolean;
  evidence_document_ids: number[];
  pinned_post_ids: string[];
}

// ---------------------------------------------------------------------------
// Service object
// ---------------------------------------------------------------------------

const BASE = "/dashboard/topics";

export const topicService = {
  // ---- Jobs ----------------------------------------------------------------

  /** Trigger a new pipeline job (runs both topic types). */
  async triggerJob(payload: JobTriggerRequest): Promise<JobTriggerResponse> {
    const res = await apiClient.post<JobTriggerResponse>(`${BASE}/jobs`, payload);
    return res.data;
  },

  /** Poll current (active or most recent) job. */
  async getCurrentJob(): Promise<JobDetailResponse | null> {
    const res = await apiClient.get<JobDetailResponse | null>(`${BASE}/jobs/current`);
    return res.data;
  },

  /** List pipeline jobs with optional status filter and limit. */
  async listJobs(params?: { status?: string; limit?: number }): Promise<JobDetailResponse[]> {
    const res = await apiClient.get<JobDetailResponse[]>(`${BASE}/jobs`, { params });
    return res.data;
  },

  /** Get a specific job by ID. */
  async getJob(jobId: string): Promise<JobDetailResponse> {
    const res = await apiClient.get<JobDetailResponse>(`${BASE}/jobs/${jobId}`);
    return res.data;
  },

  /** Get result mapping for a job by ID. */
  async getJobResults(jobId: string): Promise<Record<string, string>> {
    const res = await apiClient.get<Record<string, string>>(`${BASE}/jobs/${jobId}/results`);
    return res.data;
  },

  /** Cancel a running/pending job. */
  async cancelJob(jobId: string): Promise<JobDetailResponse> {
    const res = await apiClient.delete<JobDetailResponse>(`${BASE}/jobs/${jobId}/cancel`);
    return res.data;
  },

  /** Delete a job record. */
  async deleteJob(jobId: string): Promise<void> {
    await apiClient.delete(`${BASE}/jobs/${jobId}`);
  },

  /**
   * Download the CSV export for a completed job.
   * Triggers a browser download without navigating away.
   */
  async downloadJobCsv(resultId: string): Promise<void> {
    const res = await apiClient.get<Blob>(`${BASE}/results/${resultId}/export/csv`, {
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    try {
      const link = document.createElement("a");
      link.href = url;
      link.download = `topic_assignments_${resultId}.csv`;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  // ---- Topic list ----------------------------------------------------------

  /**
   * Get the enriched topic list for the latest or specific result of a given topic_type.
   * Each item is tagged with `topic_type` from the response envelope.
   * Returns an empty response when no result exists yet (404).
   */
  async getTopicList(topicType: TopicType, resultId?: string): Promise<TopicListResponse> {
    try {
      const res = await apiClient.get<TopicListResponse>(`${BASE}/results/latest/list`, {
        params: { topic_type: topicType, result_id: resultId },
      });
      const data = res.data;
      // Tag every item with its topic_type so a merged list can filter client-side
      return {
        ...data,
        items: data.items.map((item) => ({ ...item, topic_type: topicType })),
      };
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return {
          result_id: "",
          topic_type: topicType,
          time_range: "",
          total_topics: 0,
          total_documents: 0,
          items: [],
          created_at: "",
        };
      }
      throw err;
    }
  },

  // ---- Questions -----------------------------------------------------------

  /** Paginated raw questions for a topic (uses real source timestamps). */
  async getQuestions(params: {
    topic_type: TopicType;
    topic_id?: number;
    page?: number;
    page_size?: number;
    sort_by?: string;
    result_id?: string;
  }): Promise<TopicQuestionsResponse> {
    const res = await apiClient.get<TopicQuestionsResponse>(
      `${BASE}/results/latest/questions`,
      { params }
    );
    return res.data;
  },

  // ---- Trend ---------------------------------------------------------------

  async getTrend(params: {
    topic_type: TopicType;
    topic_id: number;
    view: TrendView;
    result_id?: string;
  }): Promise<TopicTrendResponse> {
    const res = await apiClient.get<TopicTrendResponse>(
      `${BASE}/results/latest/trends`,
      { params }
    );
    return res.data;
  },

  // ---- Keywords ------------------------------------------------------------

  async getKeywords(params: {
    topic_type: TopicType;
    topic_id: number;
    result_id?: string;
  }): Promise<TopicKeywordsResponse> {
    const res = await apiClient.get<TopicKeywordsResponse>(
      `${BASE}/results/latest/keywords`,
      { params }
    );
    return res.data;
  },

  // ---- Pin / knowledge update ---------------------------------------------

  async updatePin(
    resultId: string,
    topicId: number,
    body: TopicPinRequest
  ): Promise<TopicPinResponse> {
    const res = await apiClient.patch<TopicPinResponse>(
      `${BASE}/results/${resultId}/topics/${topicId}/pin`,
      body
    );
    return res.data;
  },
};

export default topicService;
