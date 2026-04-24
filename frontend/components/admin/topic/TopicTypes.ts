export type TopicStatus = "new" | "waiting" | "stable";
export type TopicFilter = "all" | "popular" | "missing-knowledge";
export type TrendView = "day" | "week" | "month";
export type PipelineRange = "24h" | "1w" | "2w" | "1m";

export type RawQuestion = {
  question: string;
  user: string;
  timestamp: string;
};

export type TopicItem = {
  id: string;
  title: string;
  summary: string;
  queries: number;
  lastUpdated: string;
  status: TopicStatus;
  pinned: boolean;
  knowledgeUpdated: boolean;
  featuredEntity: string;
  confidence: number;
  syncAgo: string;
  tags: string[];
  sources: { label: string; percent: string }[];
  sentimentPositive: number;
  sentimentComplex: number;
  moderationNote: string;
  rawQuestions: RawQuestion[];
};
