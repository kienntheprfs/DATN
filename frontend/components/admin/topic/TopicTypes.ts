import type { TopicListItem, TopicType } from "@/services/topic-api";

export type TopicStatus = "new" | "waiting" | "stable";
export type TopicFilter = "all" | "popular" | "missing-knowledge";
export type TrendView = "day" | "week" | "month";
export type PipelineRange = "24h" | "1w" | "2w" | "1m";

// Re-export the canonical TopicListItem from the API service so all
// components share a single source of truth.
export type { TopicListItem, TopicType };

export type RawQuestion = {
  question: string;
  user: string;
  timestamp: string;
  source?: string;
};
