import { useMemo, useState } from "react";
import { FILTERS, formatQueries } from "./TopicData";
import { TopicLoadingSkeleton } from "./TopicLoadingSkeleton";
import { TopicStatusPill } from "./TopicStatusPill";
import type { TopicFilter, TopicListItem } from "./TopicTypes";
import type { JobDetailResponse } from "@/services/topic-api";

type TopicListPanelProps = {
  isLoading: boolean;
  isError: boolean;
  topics: TopicListItem[];
  selectedTopicKey: string | null;
  currentJob: JobDetailResponse | null;
  onTopicSelect: (key: string) => void;
  onOpenPipelineModal: () => void;
  onRetry: () => void;
};

export function TopicListPanel({
  isLoading,
  isError,
  topics,
  selectedTopicKey,
  currentJob,
  onTopicSelect,
  onOpenPipelineModal,
  onRetry,
}: TopicListPanelProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<TopicFilter>("all");

  // Filter by topic_type and search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return topics.filter((t) => {
      const matchSearch =
        q.length === 0 ||
        t.title.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q);
      const matchFilter =
        activeFilter === "all" ||
        (activeFilter === "popular" && t.topic_type === "popular_questions") ||
        (activeFilter === "missing-knowledge" && t.topic_type === "missing_knowledge");
      return matchSearch && matchFilter;
    });
  }, [topics, search, activeFilter]);

  const handleFilterChange = (f: TopicFilter) => {
    setActiveFilter(f);
  };
  const handleSearch = (v: string) => {
    setSearch(v);
  };

  const isJobActive =
    currentJob?.status === "pending" || currentJob?.status === "running";

  return (
    <section className="flex min-h-0 flex-col border-b border-border-color bg-white xl:border-b-0 xl:border-r">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-4 py-4">
        <h2 className="font-heading text-[12px] font-bold uppercase tracking-widest text-slate-600">
          Danh sách Chủ đề
        </h2>
        <span className="font-mono text-[10px] text-slate-400">
          {filtered.length} Items
        </span>
      </div>

      {/* Filters */}
      <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-border-color bg-white px-4 py-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => handleFilterChange(filter.key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
              activeFilter === filter.key
                ? "bg-primary text-white shadow-sm"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
            title={`Lọc theo ${filter.label}`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="border-b border-border-color bg-white px-4 py-3">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Tìm chủ đề..."
            className="w-full rounded-sm border border-border-color bg-slate-50 py-1.5 pl-10 pr-3 text-xs text-slate-700 transition-all outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* List — no pagination, show all */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isLoading ? (
          <TopicLoadingSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-400">error</span>
            <p className="text-sm text-slate-500">Không thể tải danh sách chủ đề.</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-sm bg-primary px-4 py-2 text-xs font-bold text-white hover:bg-primary-dark"
            >
              Thử lại
            </button>
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-blue-200">hub</span>
            <p className="text-sm font-medium text-slate-500">Chưa có dữ liệu chủ đề</p>
            <p className="max-w-[240px] text-xs leading-relaxed text-slate-400">
              Hãy chạy Pipeline Topic Modeling để phân tích và trích xuất các chủ đề từ dữ liệu hệ thống.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
            <p className="text-sm text-slate-400">Không tìm thấy chủ đề nào phù hợp bộ lọc.</p>
          </div>
        ) : (
          filtered.map((topic) => {
            const key = `${topic.topic_type}:${topic.topic_id}`;
            const isActive = key === selectedTopicKey;
            const isMissing = topic.topic_type === "missing_knowledge";
            return (
              <button
                key={`${topic.topic_type}-${topic.topic_id}`}
                type="button"
                onClick={() => onTopicSelect(key)}
                className={`group w-full border-b border-border-color p-4 text-left transition-colors ${
                  isActive
                    ? "border-l-4 border-l-primary bg-blue-50/50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="flex-1 break-all text-sm font-bold leading-tight text-slate-900">
                    {topic.title}
                  </h3>
                  <span className="shrink-0 font-mono text-[10px] uppercase text-slate-400">
                    {formatQueries(topic.queries)}
                  </span>
                </div>
                <div className="mb-3 line-clamp-1 text-[11px] text-slate-500">
                  {topic.summary}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <TopicStatusPill
                      status={topic.status}
                      pinned={topic.pinned}
                      knowledgeUpdated={topic.knowledge_updated}
                    />
                    {/* Topic type badge */}
                    {/* <span
                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                        isMissing
                          ? "border border-orange-200 bg-orange-50 text-orange-600"
                          : "border border-blue-200 bg-blue-50 text-blue-600"
                      }`}
                    >
                      {isMissing ? "Tri thức" : "Phổ biến"}
                    </span> */}
                  </div>
                  <span className="text-[10px] text-slate-400">{topic.sync_ago}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Footer: pipeline button only */}
      <div className="border-t border-border-color bg-slate-50 p-2 pb-1.5">
        <div className="flex flex-col items-center gap-3">
          {/* Job status indicator */}
          {isJobActive && (
            <div className="flex w-full items-center gap-2 rounded-sm border border-blue-200 bg-blue-50 px-3 py-2">
              <span className="material-symbols-outlined animate-spin text-[16px] text-blue-600">
                progress_activity
              </span>
              <span className="text-[10px] font-medium text-blue-800">
                Pipeline đang chạy... {currentJob?.progress ?? 0}%
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={onOpenPipelineModal}
            disabled={isJobActive}
            className="relative inline-flex w-auto items-center justify-center gap-2 overflow-hidden rounded-sm px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%), hsl(240, 96%, 19%)",
              boxShadow:
                "0 4px 12px rgba(3, 3, 145, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
            title={isJobActive ? "Pipeline đang chạy" : "Khởi chạy pipeline topic modeling"}
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            Chạy Pipeline Topic Modeling
          </button>
        </div>
      </div>
    </section>
  );
}
