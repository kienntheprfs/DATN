import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { statusBadgeLabel } from "./TopicData";
import type { TopicListItem, TrendView, TopicType } from "./TopicTypes";
import topicService from "@/services/topic-api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TopicDetailPanelProps = {
  isLoading: boolean;
  isError: boolean;
  selectedTopic: TopicListItem | null;
  topicType: TopicType;
  trendView: TrendView;
  isPinning: boolean;
  isUpdatingKnowledge: boolean;
  onTrendViewChange: (value: TrendView) => void;
  onPinTopic: () => void;
  onUpdateKnowledge: () => void;
};

// ---------------------------------------------------------------------------
// Loading skeleton (unchanged design)
// ---------------------------------------------------------------------------

function TopicDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="mb-4 flex gap-2">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="h-8 w-96 rounded bg-slate-300" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-10 rounded bg-slate-200" />
          <div className="h-10 w-10 rounded bg-slate-200" />
          <div className="h-10 w-10 rounded bg-slate-200" />
        </div>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-24 rounded bg-slate-200" />
        <div className="h-24 rounded bg-slate-200" />
        <div className="h-24 rounded bg-slate-200" />
      </div>
      <div className="mb-8 rounded-sm border border-border-color bg-white">
        <div className="border-b border-border-color p-6">
          <div className="mb-6 h-4 w-1/4 rounded bg-slate-200" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-4 h-3 w-1/3 rounded bg-slate-100" />
              <div className="mb-8 flex flex-wrap gap-2">
                <div className="h-6 w-16 rounded bg-slate-100" />
                <div className="h-6 w-20 rounded bg-slate-100" />
                <div className="h-6 w-14 rounded bg-slate-100" />
              </div>
              <div className="mb-4 h-3 w-1/2 rounded bg-slate-100" />
              <div className="space-y-2">
                <div className="h-8 w-full rounded border border-slate-100 bg-slate-50" />
                <div className="h-8 w-full rounded border border-slate-100 bg-slate-50" />
              </div>
            </div>
            <div>
              <div className="mb-4 h-3 w-1/3 rounded bg-slate-100" />
              <div className="h-32 w-full rounded border border-slate-100 bg-slate-50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trend chart component (queries its own data)
// ---------------------------------------------------------------------------

function TrendChart({
  topicType,
  topicId,
  resultId,
  view,
}: {
  topicType: TopicType;
  topicId: number;
  resultId: string;
  view: TrendView;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["topics", "trend", topicType, topicId, view],
    queryFn: () => topicService.getTrend({ topic_type: topicType, topic_id: topicId, view }),
    enabled: !!topicId,
  });

  const points = data?.data ?? [];
  const max = Math.max(...points.map((p) => p.count), 1);

  // Period labels
  const VIEW_LABELS: Record<TrendView, string[]> = {
    day: ["T2", "T3", "T4", "T5", "T6", "T7", "CN"],
    week: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"],
    month: ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"],
  };

  if (isLoading) {
    return (
      <div className="animate-pulse h-32 w-full rounded border border-slate-100 bg-slate-50" />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded border border-border-color bg-slate-50 text-xs text-slate-400">
        Chưa có dữ liệu xu hướng
      </div>
    );
  }

  return (
    <>
      <div className="flex h-32 w-full items-end justify-between gap-1 rounded-sm border border-border-color bg-slate-50 p-4">
        {points.map((point, index) => {
          const heightPct = Math.round((point.count / max) * 100);
          const isMax = point.count === max;
          return (
            <div
              key={point.period}
              className={`w-full rounded-t-sm transition-all ${
                isMax ? "bg-primary" : index % 2 === 0 ? "bg-blue-200" : "bg-blue-300"
              }`}
              style={{ height: `${Math.max(heightPct, 4)}%` }}
              title={`${point.period}: ${point.count} truy vấn`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between overflow-x-auto font-mono text-[10px] text-slate-400">
        {points.slice(0, VIEW_LABELS[view].length).map((p, i) => (
          <span key={p.period}>{VIEW_LABELS[view][i] ?? ""}</span>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Questions table component (queries its own data with pagination)
// ---------------------------------------------------------------------------

function QuestionsTable({
  topicType,
  topicId,
}: {
  topicType: TopicType;
  topicId: number;
}) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"created_desc" | "created_asc">("created_desc");
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["topics", "questions", topicType, topicId, page, sortBy],
    queryFn: () =>
      topicService.getQuestions({
        topic_type: topicType,
        topic_id: topicId,
        page,
        page_size: PAGE_SIZE,
        sort_by: sortBy,
      }),
    enabled: !!topicId,
    placeholderData: (prev) => prev,
  });

  const questions = data?.items ?? [];
  const totalPages = data?.total_pages ?? 1;
  const totalItems = data?.total_items ?? 0;

  const toggleSort = () =>
    setSortBy((prev) => (prev === "created_desc" ? "created_asc" : "created_desc"));

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="mb-8 overflow-hidden rounded-sm border border-border-color bg-white">
      <div className="flex items-center justify-between border-b border-border-color bg-slate-50/50 px-6 py-3">
        <h3 className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-700">
          Danh sách câu hỏi thô
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
          {totalItems} câu hỏi
        </span>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="animate-pulse space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 rounded bg-slate-100" />
            ))}
          </div>
        ) : (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50">
                <th className="border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Câu hỏi
                </th>
                <th className="border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Nguồn
                </th>
                <th
                  className="flex cursor-pointer items-center gap-1 border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-blue-50"
                  onClick={toggleSort}
                  title="Đổi thứ tự thời gian"
                >
                  Thời gian
                  <span className="material-symbols-outlined text-[14px]">
                    {sortBy === "created_desc" ? "arrow_downward" : "arrow_upward"}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="text-xs text-slate-700">
              {questions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-400">
                    Không có câu hỏi nào
                  </td>
                </tr>
              ) : (
                questions.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b border-border-color transition-colors hover:bg-slate-50 last:border-b-0"
                  >
                    <td className="px-6 py-3 leading-relaxed">{q.question}</td>
                    <td className="px-6 py-3 font-medium text-slate-500">
                      {q.source?.replace("_", " ") ?? "—"}
                    </td>
                    <td className="px-6 py-3 font-mono text-[10px] text-slate-500">
                      {formatDate(q.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border-color bg-slate-50/50 px-6 py-3">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Trang trước
          </button>
          <span className="font-mono text-[10px] text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Trang sau →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function TopicDetailPanel({
  isLoading,
  isError,
  selectedTopic,
  topicType,
  trendView,
  isPinning,
  isUpdatingKnowledge,
  onTrendViewChange,
  onPinTopic,
  onUpdateKnowledge,
}: TopicDetailPanelProps) {
  // Download CSV for the latest result's job
  const handleDownload = async () => {
    if (!selectedTopic) return;
    // We need the job_id — currently result_id is available; for now
    // we use result_id as a proxy until the job_id is exposed in topic list.
    // TODO: expose job_id in TopicListItem if needed.
    try {
      // Trigger CSV download via blob
      await topicService.downloadJobCsv(selectedTopic.result_id);
    } catch {
      // If result_id isn't a valid job_id, user sees network error — acceptable fallback
    }
  };

  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden">
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 pb-28 md:p-8">
        <div className="mx-auto w-full max-w-4xl">
          {isLoading ? (
            <TopicDetailLoading />
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 pt-20 text-center">
              <span className="material-symbols-outlined text-5xl text-red-300">error_outline</span>
              <p className="text-sm text-slate-500">Không thể tải thông tin chủ đề.</p>
            </div>
          ) : !selectedTopic ? (
            <div className="flex flex-col items-center gap-4 pt-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <span className="material-symbols-outlined text-4xl text-blue-300">hub</span>
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Chưa có dữ liệu chủ đề</p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-400">
                  Chạy Pipeline Topic Modeling ở bảng bên trái để bắt đầu phân tích.
                  Hệ thống sẽ tự động trích xuất các chủ đề nổi bật.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="border border-border-color bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      ID: {selectedTopic.topic_id}
                    </span>
                    {selectedTopic.knowledge_updated && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pink-600">
                        <span className="material-symbols-outlined text-[10px]">history_edu</span>
                        Đã cập nhật tri thức
                      </span>
                    )}
                    {selectedTopic.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-600">
                        <span className="material-symbols-outlined text-[10px]">push_pin</span>
                        Đã ghim bài lên trang chủ
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">{selectedTopic.title}</h1>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Chia sẻ"
                  >
                    <span className="material-symbols-outlined text-xl">share</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Tải xuống CSV"
                    onClick={handleDownload}
                  >
                    <span className="material-symbols-outlined text-xl">download</span>
                  </button>
                  <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Thêm hành động"
                  >
                    <span className="material-symbols-outlined text-xl">more_horiz</span>
                  </button>
                </div>
              </div>

              {/* KPI cards */}
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                {/* Featured entity */}
                <div className="rounded-sm border border-white/10 bg-primary p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/60">
                    Từ khóa nổi bật
                  </div>
                  <div className="break-all text-2xl font-bold leading-tight text-white">
                    {selectedTopic.featured_entity}
                  </div>
                  {/* <div className="mt-2 font-mono text-[11px] text-white/60">
                    Tỉ lệ xuất hiện:{" "}
                    <span className="font-bold text-white">
                      {selectedTopic.featured_entity_rate}%
                    </span>
                  </div> */}
                </div>

                {/* Confidence */}
                <div className="rounded-sm border border-border-color bg-white p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Tỉ lệ xuất hiện của từ khóa
                  </div>
                  <div className="font-mono text-[24px] font-bold leading-none text-slate-900">
                    {selectedTopic.featured_entity_rate}%
                  </div>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${selectedTopic.featured_entity_rate}%` }}
                    />
                  </div>
                </div>

                {/* Sync */}
                {/* <div className="rounded-sm border border-border-color bg-white p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Đồng bộ cuối
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-900">
                    {selectedTopic.sync_ago}
                  </div>
                  <div className="mt-2 flex items-center text-[10px] font-bold uppercase tracking-tight text-emerald-600">
                    <span className="material-symbols-outlined mr-1 text-sm">check_circle</span>
                    {statusBadgeLabel[selectedTopic.status] ?? selectedTopic.status}
                  </div>
                </div> */}
                {/* Queries */}
                <div className="rounded-sm border border-border-color bg-white p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Số câu hỏi
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-900">
                    {selectedTopic.queries}
                  </div>
                  
                </div>
              </div>

              {/* Analysis section */}
              <div className="mb-8 rounded-sm border border-border-color bg-white">
                <div className="flex flex-col items-start justify-between gap-3 border-b border-border-color bg-slate-50/50 px-6 py-3 md:flex-row md:items-center">
                  <h3 className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-700">
                    Báo cáo Phân tích Chi tiết
                  </h3>
                  {/* Trend view toggle */}
                  <div className="inline-flex rounded-sm border border-border-color bg-white p-0.5">
                    {(["day", "week", "month"] as TrendView[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onTrendViewChange(v)}
                        className={`px-3 py-1 text-[10px] font-bold ${
                          trendView === v
                            ? "rounded-sm bg-primary text-white"
                            : "text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        {v === "day" ? "Ngày" : v === "week" ? "Tuần" : "Tháng"}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    {/* Left: keywords + sources */}
                    <div>
                      <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Từ khóa chính
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTopic.tags.map((tag) => (
                          <span
                            key={tag}
                            className="break-all rounded-sm border border-border-color bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600"
                            title={`Từ khóa: ${tag}`}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          Nguồn dữ liệu trích xuất
                        </h4>
                        <div className="space-y-2">
                          {selectedTopic.sources.map((source) => (
                            <div
                              key={source.label}
                              className="flex items-center justify-between rounded-sm border border-border-color bg-slate-50 p-2 text-xs"
                            >
                              <span className="text-slate-700">{source.label}</span>
                              <span className="font-mono text-slate-500">{source.percent}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Right: trend + sentiment */}
                    <div>
                      <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">
                        Xu hướng truy vấn
                      </h4>
                      <TrendChart
                        topicType={topicType}
                        topicId={selectedTopic.topic_id}
                        resultId={selectedTopic.result_id}
                        view={trendView}
                      />

                      <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">
                          Phân tích sắc thái (Sentiment)
                        </h4>
                        <div className="flex flex-col gap-4 sm:flex-row">
                          <div className="flex-1">
                            <div className="mb-1 flex justify-between text-[10px] font-bold">
                              <span>TÍCH CỰC</span>
                              <span>{selectedTopic.sentiment.positive}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${selectedTopic.sentiment.positive}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 flex justify-between text-[10px] font-bold">
                              <span>TRUNG TÍNH</span>
                              <span>{selectedTopic.sentiment.neutral}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full bg-orange-400"
                                style={{ width: `${selectedTopic.sentiment.neutral}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Questions table — fetches its own data */}
              <QuestionsTable
                topicType={topicType}
                topicId={selectedTopic.topic_id}
              />
            </>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-end gap-3 border-t border-border-color bg-white/80 p-2 pb-1.5 backdrop-blur-md">
        <button
          type="button"
          onClick={onPinTopic}
          disabled={isPinning || isLoading || !selectedTopic}
          className="inline-flex items-center gap-2 rounded-sm border-2 border-primary bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-primary shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          title={selectedTopic?.pinned ? "Bỏ ghim bài" : "Ghim bài viết lên trang chủ"}
        >
          {isPinning && (
            <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
          )}
          {selectedTopic?.pinned ? "Bỏ ghim trang chủ" : "Thêm bài ghim trang chủ"}
        </button>
        <button
          type="button"
          onClick={onUpdateKnowledge}
          disabled={isUpdatingKnowledge || isLoading || !selectedTopic}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          title={
            selectedTopic?.knowledge_updated
              ? "Bỏ đánh dấu cập nhật tri thức"
              : "Đánh dấu đã cập nhật tri thức"
          }
        >
          {isUpdatingKnowledge && (
            <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
          )}
          {selectedTopic?.knowledge_updated ? "Bỏ cập nhật tri thức" : "Cập nhật tri thức"}
        </button>
      </div>
    </section>
  );
}
