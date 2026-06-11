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
  selectedResultId: string | null;
  onClearResultId: () => void;
  onTopicSelect: (key: string) => void;
  onOpenPipelineModal: () => void;
  onOpenHistoryDrawer: () => void;
  onRetry: () => void;
};

export function TopicListPanel({
  isLoading,
  isError,
  topics,
  selectedTopicKey,
  currentJob,
  selectedResultId,
  onClearResultId,
  onTopicSelect,
  onOpenPipelineModal,
  onOpenHistoryDrawer,
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
    <section className="topic-list-panel flex min-h-0 flex-col border-b border-border-color bg-white xl:border-b-0 xl:border-r font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-4 py-3">
        <h2 className="font-heading text-[12px] font-bold uppercase tracking-widest text-slate-600">
          Danh sách Chủ đề
        </h2>
        <span className="font-sans text-[11px] font-medium text-slate-400">
          {filtered.length} Chủ đề
        </span>
      </div>

      {/* Filters */}
      <div className="flex shrink-0 gap-2 border-b border-border-color bg-white px-4 py-1.5">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => handleFilterChange(filter.key)}
            className={`filter-btn flex-1 text-center whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition-colors ${
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
      <div className="border-b border-border-color bg-white px-4 py-2">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">
            search
          </span>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Tìm chủ đề..."
            className="w-full rounded-sm border border-border-color bg-slate-50 py-1.5 pl-10 pr-4 text-[13px] text-slate-700 transition-all outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Warning banner for viewing past runs */}
      {selectedResultId && (
        <div className="warning-banner bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-xs font-semibold text-amber-700 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-sm shrink-0">warning</span>
            <span className="truncate">Đang xem kết quả từ lần chạy cũ</span>
          </div>
          <button
            onClick={onClearResultId}
            className="text-primary hover:underline shrink-0 ml-2 font-bold cursor-pointer"
          >
            Xem mới nhất
          </button>
        </div>
      )}

      {/* List — no pagination, show all */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isLoading ? (
          <TopicLoadingSkeleton />
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-400">error</span>
            <p className="text-base text-slate-500">Không thể tải danh sách chủ đề.</p>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-sm bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-dark"
            >
              Thử lại
            </button>
          </div>
        ) : topics.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-blue-200">hub</span>
            <p className="text-base font-medium text-slate-500">Chưa có dữ liệu chủ đề</p>
            <p className="max-w-[240px] text-sm leading-relaxed text-slate-400">
              Hãy chạy Pipeline Topic Modeling để phân tích và trích xuất các chủ đề từ dữ liệu hệ thống.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300">search_off</span>
            <p className="text-base text-slate-400">Không tìm thấy chủ đề nào phù hợp bộ lọc.</p>
          </div>
        ) : (
          filtered.map((topic) => {
            const key = `${topic.topic_type}:${topic.topic_id}`;
            const isActive = key === selectedTopicKey;
            return (
              <button
                key={`${topic.topic_type}-${topic.topic_id}`}
                type="button"
                onClick={() => onTopicSelect(key)}
                className={`group w-full border-b border-border-color py-6 px-3 text-left transition-colors ${
                  isActive
                    ? "border-l-5 border-l-primary bg-blue-100/50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="mb-0.5 flex items-start justify-between gap-3">
                  <h3
                    className="flex-1 text-2xl font-bold leading-tight text-slate-900"
                    title={topic.title}
                  >
                    {topic.title}
                  </h3>
                  <span className="topic-queries shrink-0 font-sans text-2xl font-bold uppercase text-slate-400">
                    {formatQueries(topic.queries)}
                  </span>
                </div>
                <div className="topic-summary mb-2 line-clamp-1 text-xl text-slate-500">
                  {topic.summary}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TopicStatusPill
                      status={topic.status}
                      pinned={topic.pinned}
                      knowledgeUpdated={topic.knowledge_updated}
                      discarded={topic.discarded}
                      linkedDocsCount={(topic as any).linkedDocsCount}
                      isConfirmed={(topic as any).isConfirmed}
                    />
                  </div>
                  <span className="sync-ago text-[12px] text-slate-400">{topic.sync_ago}</span>
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
              <span className="text-[12px] font-medium text-blue-800">
                Pipeline đang chạy... {currentJob?.progress ?? 0}%
              </span>
            </div>
          )}

          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={onOpenPipelineModal}
              disabled={isJobActive}
              className="footer-btn flex-1 relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-sm px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%), hsl(240, 96%, 19%)",
                boxShadow:
                  "0 4px 12px rgba(3, 3, 145, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
              }}
              title={isJobActive ? "Pipeline đang chạy" : "Khởi chạy thuật toán phân loại chủ đề"}
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              Phân loại
            </button>

            <button
              type="button"
              onClick={onOpenHistoryDrawer}
              className="footer-btn flex-1 inline-flex items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-[13px] font-bold uppercase tracking-wide text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
              title="Xem lịch sử chạy pipeline"
            >
              <span className="material-symbols-outlined text-[18px]">history</span>
              Lịch sử
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
