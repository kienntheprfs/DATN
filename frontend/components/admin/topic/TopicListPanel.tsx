import { FILTERS, formatQueries } from "./TopicData";
import { TopicLoadingSkeleton } from "./TopicLoadingSkeleton";
import { TopicStatusPill } from "./TopicStatusPill";
import type { TopicFilter, TopicItem } from "./TopicTypes";

type TopicListPanelProps = {
  isLoading: boolean;
  search: string;
  activeFilter: TopicFilter;
  filteredCount: number;
  paginatedTopics: TopicItem[];
  selectedTopicId: string;
  pageInfoText: string;
  isFirstPage: boolean;
  isLastPage: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: TopicFilter) => void;
  onTopicSelect: (topicId: string) => void;
  onOpenPipelineModal: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
};

export function TopicListPanel({
  isLoading,
  search,
  activeFilter,
  filteredCount,
  paginatedTopics,
  selectedTopicId,
  pageInfoText,
  isFirstPage,
  isLastPage,
  onSearchChange,
  onFilterChange,
  onTopicSelect,
  onOpenPipelineModal,
  onPrevPage,
  onNextPage,
}: TopicListPanelProps) {
  return (
    <section className="flex min-h-0 flex-col border-b border-border-color bg-white xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-4 py-4">
        <h2 className="font-heading text-[12px] font-bold uppercase tracking-widest text-slate-600">Danh sách Chủ đề</h2>
        <span className="font-mono text-[10px] text-slate-400">{filteredCount} Items</span>
      </div>

      <div className="custom-scrollbar flex shrink-0 gap-2 overflow-x-auto border-b border-border-color bg-white px-4 py-2">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            onClick={() => onFilterChange(filter.key)}
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

      <div className="border-b border-border-color bg-white px-4 py-3">
        <div className="relative">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-slate-400">search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Tìm chủ đề..."
            className="w-full rounded-sm border border-border-color bg-slate-50 py-1.5 pl-10 pr-3 text-xs text-slate-700 transition-all outline-none focus:border-primary"
          />
        </div>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {isLoading ? (
          <TopicLoadingSkeleton />
        ) : (
          paginatedTopics.map((topic) => {
            const isActive = topic.id === selectedTopicId;

            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => onTopicSelect(topic.id)}
                className={`group w-full border-b border-border-color p-4 text-left transition-colors ${
                  isActive
                    ? "border-l-4 border-l-primary bg-blue-50/50"
                    : "hover:bg-slate-50"
                }`}
              >
                <div className="mb-1 flex items-start justify-between gap-3">
                  <h3 className="text-sm font-bold leading-tight text-slate-900">{topic.title}</h3>
                  <span className="font-mono text-[10px] uppercase text-slate-400">{formatQueries(topic.queries)}</span>
                </div>
                <div className="mb-3 line-clamp-1 text-[11px] text-slate-500">{topic.summary}</div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <TopicStatusPill topic={topic} />
                    {topic.pinned && topic.knowledgeUpdated && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pink-600">
                        <span className="material-symbols-outlined text-[10px]">history_edu</span>
                        Đã cập nhật tri thức
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">{topic.lastUpdated}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-border-color bg-slate-50 p-3">
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={onOpenPipelineModal}
            className="relative mb-3 inline-flex w-auto items-center justify-center gap-2 overflow-hidden rounded-sm px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-white transition-all duration-200 hover:-translate-y-px"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 50%, rgba(0,0,0,0.1) 100%), hsl(240, 96%, 19%)",
              boxShadow:
                "0 4px 12px rgba(3, 3, 145, 0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
            }}
            title="Khởi chạy pipeline topic modeling"
          >
            <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
            Chạy Pipeline Topic Modeling
          </button>
          {/* <div className="flex w-full items-center justify-between px-2">
            <button
              type="button"
              className="rounded-sm border border-border-color p-1 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isFirstPage}
              onClick={onPrevPage}
              title="Trang trước"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <span className="text-[10px] font-medium text-slate-500">{pageInfoText}</span>
            <button
              type="button"
              className="rounded-sm border border-border-color p-1 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLastPage}
              onClick={onNextPage}
              title="Trang sau"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div> */}
        </div>
      </div>
    </section>
  );
}
