import type { PipelineRange, TopicFilter, TopicStatus } from "./TopicTypes";

// ---------------------------------------------------------------------------
// Static filter config
// ---------------------------------------------------------------------------

export const FILTERS: { key: TopicFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "popular", label: "Câu hỏi phổ biến" },
  { key: "missing-knowledge", label: "Thiếu Tri thức" },
];

// ---------------------------------------------------------------------------
// Pipeline range labels
// ---------------------------------------------------------------------------

export const PIPELINE_RANGE_LABELS: Record<PipelineRange, string> = {
  "24h": "24h qua",
  "1w": "1 tuần qua",
  "2w": "2 tuần qua",
  "1m": "1 tháng qua",
};

// ---------------------------------------------------------------------------
// Status badge styling
// ---------------------------------------------------------------------------

export const statusBadgeClass: Record<TopicStatus, string> = {
  new: "bg-emerald-50 text-emerald-700 border-emerald-100",
  waiting: "bg-orange-50 text-orange-700 border-orange-100",
  stable: "bg-emerald-50 text-emerald-700 border-emerald-100",
};

export const statusBadgeLabel: Record<TopicStatus, string> = {
  new: "Mới",
  waiting: "Chờ",
  stable: "Hệ thống ổn định",
};

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export const formatQueries = (value: number) => `${value.toLocaleString("vi-VN")} Câu hỏi`;
