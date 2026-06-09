import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  LabelList 
} from "recharts";
import { statusBadgeLabel } from "./TopicData";
import type { TopicListItem, TrendView, TopicType } from "./TopicTypes";
import topicService from "@/services/topic-api";

// ---------------------------------------------------------------------------
// Confirm Modal
// ---------------------------------------------------------------------------

type ConfirmModalProps = {
  open: boolean;
  type: "pin" | "knowledge" | "discard" | null;
  topic: TopicListItem | null;
  isLoading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmModal({ open, type, topic, isLoading, onConfirm, onCancel }: ConfirmModalProps) {
  if (!open || !topic || !type) return null;

  const isPinned = topic.pinned;
  const isKnowledgeUpdated = topic.knowledge_updated;

  const config = type === "pin"
    ? {
        icon: isPinned ? "bookmark_remove" : "push_pin",
        iconBg: isPinned ? "bg-orange-100" : "bg-blue-100",
        iconColor: isPinned ? "text-orange-600" : "text-primary",
        title: isPinned ? "Bỏ ghim trang chủ" : "Ghim bài lên trang chủ",
        badge: isPinned ? "Đang ghim" : null,
        badgeColor: "bg-red-100 text-red-700 border border-red-200",
        description: isPinned
          ? "Hành động này sẽ gỡ chủ đề khỏi trang chủ. Người dùng sẽ không còn thấy bài viết được ghim từ chủ đề này."
          : "Hành động này sẽ đưa chủ đề lên trang chủ dưới dạng bài viết ghim. Người dùng sẽ thấy nội dung này nổi bật.",
        confirmLabel: isPinned ? "Bỏ ghim" : "Xác nhận ghim",
        confirmStyle: isPinned
          ? "bg-orange-500 hover:bg-orange-600 text-white"
          : "bg-primary hover:bg-primary-dark text-white",
      }
    : type === "knowledge"
    ? {
        icon: isKnowledgeUpdated ? "undo" : "history_edu",
        iconBg: isKnowledgeUpdated ? "bg-slate-100" : "bg-pink-100",
        iconColor: isKnowledgeUpdated ? "text-slate-600" : "text-pink-600",
        title: isKnowledgeUpdated ? "Bỏ đánh dấu tri thức" : "Cập nhật tri thức",
        badge: isKnowledgeUpdated ? "Đã cập nhật" : null,
        badgeColor: "bg-pink-100 text-pink-700 border border-pink-200",
        description: isKnowledgeUpdated
          ? "Hành động này sẽ bỏ đánh dấu \"đã cập nhật tri thức\" của chủ đề. Trạng thái sẽ trở về chưa xử lý."
          : "Xác nhận rằng bạn đã bổ sung tri thức liên quan đến chủ đề này vào hệ thống chatbot.",
        confirmLabel: isKnowledgeUpdated ? "Bỏ đánh dấu" : "Xác nhận đã cập nhật",
        confirmStyle: isKnowledgeUpdated
          ? "bg-slate-600 hover:bg-slate-700 text-white"
          : "bg-primary hover:bg-primary-dark text-white",
      }
    : {
        icon: topic.discarded ? "restore" : "delete",
        iconBg: topic.discarded ? "bg-emerald-100" : "bg-red-100",
        iconColor: topic.discarded ? "text-emerald-600" : "text-red-600",
        title: topic.discarded ? "Khôi phục chủ đề" : "Loại bỏ chủ đề",
        badge: topic.discarded ? "Đã loại bỏ" : null,
        badgeColor: "bg-red-100 text-red-700 border border-red-200",
        description: topic.discarded
          ? "Hành động này sẽ khôi phục lại chủ đề này để bạn có thể ghim lên trang chủ hoặc cập nhật tri thức."
          : "Hành động này sẽ đánh dấu loại bỏ chủ đề này. Các nút Cập nhật tri thức và Ghim trang chủ sẽ bị vô hiệu hóa.",
        confirmLabel: topic.discarded ? "Khôi phục" : "Xác nhận loại bỏ",
        confirmStyle: topic.discarded
          ? "bg-emerald-600 hover:bg-emerald-700 text-white"
          : "bg-red-600 hover:bg-red-700 text-white",
      };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      onClick={onCancel}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative z-10 mx-4 w-full max-w-md rounded-lg border border-border-color bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border-color px-6 py-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${config.iconBg}`}>
            <span className={`material-symbols-outlined text-[22px] ${config.iconColor}`}>{config.icon}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{config.title}</h2>
              {config.badge && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${config.badgeColor}`}>
                  {config.badge}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Topic Info */}
        <div className="px-6 pt-4">
          <div className="rounded-md border border-border-color bg-slate-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Chủ đề được chọn</p>
            <p className="text-sm font-bold text-slate-900 leading-snug">{topic.title.replace(/_/g, " ")}</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-[12px] text-slate-500">
                <span className="font-bold text-slate-700">{topic.queries}</span> câu hỏi
              </span>
              <span className="text-[12px] text-slate-500">
                Từ khóa: <span className="font-bold text-slate-700">{topic.featured_entity.replace(/_/g, " ")}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="px-6 py-4">
          <p className="text-[13px] leading-relaxed text-slate-600">{config.description}</p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border-color px-6 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="rounded-sm border border-border-color bg-white px-4 py-2 text-[13px] font-bold uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 rounded-sm px-4 py-2 text-[13px] font-bold uppercase tracking-widest shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${config.confirmStyle}`}
          >
            {isLoading && (
              <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
            )}
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  isDiscarding: boolean;
  onTrendViewChange: (value: TrendView) => void;
  onPinTopic: () => void;
  onUpdateKnowledge: () => void;
  onDiscardTopic: () => void;
  linkedDocs?: any[];
  isConfirmed?: boolean;
  onOpenKnowledgeDrawer: () => void;
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
  view,
}: {
  topicType: TopicType;
  topicId: number;
  resultId: string;
  view: TrendView;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["topics", "trend", topicType, topicId, view],
    queryFn: () => topicService.getTrend({ topic_type: topicType, topic_id: topicId, view }),
    enabled: topicId !== undefined && topicId !== null,
  });

  const rawPoints = data?.data ?? [];

  if (isLoading) {
    return (
      <div className="animate-pulse h-64 w-full rounded-sm border border-slate-100 bg-slate-50" />
    );
  }

  if (rawPoints.length === 0) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-sm border border-border-color bg-slate-50 text-sm text-slate-900">
        Chưa có dữ liệu xu hướng
      </div>
    );
  }

  // Format data for Recharts
  const chartData = rawPoints.map((p, i) => {
    let label = "";
    if (view === "day") {
      try {
        const date = new Date(p.period);
        const day = date.getDay();
        const dowMap: Record<number, string> = {
          1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN"
        };
        label = dowMap[day] || "";
      } catch {
        label = p.period;
      }
    } else if (view === "week") {
      label = `Tuần ${i + 1}`;
    } else {
      label = p.period;
    }

    return {
      name: label,
      value: p.count,
      fullDate: p.period,
    };
  });

  // Calculate ranks for highlighting
  const sortedValues = [...chartData].map(d => d.value).sort((a, b) => b - a);
  const top1 = sortedValues[0];
  const top2 = sortedValues[1];
  const top3 = sortedValues[2];

  const getCellColor = (val: number, index: number) => {
    if (index === activeIndex) return '#166534'; // Green 800 (Dark green on hover/focus)
    if (val === top1 && val > 0) return '#1e3a8a'; // Blue 900 (Rank 1)
    if (val === top2 && val > 0) return '#2563eb'; // Blue 600 (Rank 2)
    if (val === top3 && val > 0) return '#60a5fa'; // Blue 400 (Rank 3)
    return '#bfdbfe'; // Blue 200 (Others - more visible)
  };

  const handleCellClick = (_data: any, index: number) => {
    setActiveIndex(index === activeIndex ? null : index);
  };

  return (
    <div className="w-full outline-none">
      <div className="h-64 w-full rounded-sm border border-border-color bg-slate-50 p-3 outline-none">
        <ResponsiveContainer width="100%" height="100%" className="outline-none">
          <BarChart 
            data={chartData} 
            margin={{ top: 25, right: 10, left: -25, bottom: 0 }}
            style={{ outline: 'none' }}
            onClick={(state: any) => {
               if (state && state.activeTooltipIndex !== undefined) {
                 setActiveIndex(state.activeTooltipIndex);
               }
            }}
          >
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#475569', fontSize: 11, fontWeight: 700 }}
              interval={0}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              domain={[0, 'dataMax']}
            />
            <Tooltip
              cursor={{ fill: 'rgba(0,0,0,0.03)' }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-sm border border-slate-200 bg-white p-2 shadow-xl">
                      <p className="text-[10px] font-bold uppercase text-slate-400">{data.fullDate}</p>
                      <p className="text-sm font-bold text-primary">{data.value} truy vấn</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar 
              dataKey="value" 
              radius={[4, 4, 0, 0]}
              barSize={32}
            >
              <LabelList 
                dataKey="value" 
                position="top" 
                style={{ fill: '#1e40af', fontSize: 12, fontWeight: 800 }} 
              />
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  cursor="pointer"
                  fill={getCellColor(entry.value, index)}
                  className="transition-all duration-300"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      
      {/* Dynamic info below chart when a bar is clicked/highlighted */}
      <div className="mt-2 min-h-[20px]">
        {activeIndex !== null && (
          <div className="flex items-center gap-2 text-[12px] font-bold text-primary animate-in fade-in slide-in-from-top-1">
            <span className="material-symbols-outlined text-[14px]">analytics</span>
            <span>{chartData[activeIndex].name} ({chartData[activeIndex].fullDate}):</span>
            <span className="text-slate-900">{chartData[activeIndex].value} truy vấn</span>
          </div>
        )}
      </div>
    </div>
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
    enabled: topicId !== undefined && topicId !== null,
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
        <h3 className="font-heading text-[16px] font-bold uppercase tracking-wider text-slate-700">
          Danh sách câu hỏi
        </h3>
        <span className="font-sans text-[12px] font-bold uppercase tracking-widest text-slate-900">
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
                <th className="border-b border-border-color px-6 py-3 text-[15px] font-bold uppercase tracking-wider text-primary">
                  Câu hỏi
                </th>
{/* <th className="border-b border-border-color px-6 py-3 text-[15px] font-bold uppercase tracking-wider text-primary">
                  Nguồn
                </th> */}
                <th
                  className="flex cursor-pointer items-center gap-1 border-b border-border-color px-6 py-3 text-[15px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-blue-50"
                  onClick={toggleSort}
                  title="Đổi thứ tự thời gian"
                >
                  Thời gian
                  <span className="material-symbols-outlined text-[16px]">
                    {sortBy === "created_desc" ? "arrow_downward" : "arrow_upward"}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="text-[15px] text-slate-700">
              {questions.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-900">
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
{/* <td className="px-6 py-3 font-medium text-slate-500">
                      {q.source?.replace("_", " ") ?? "—"}
                    </td> */}
                    <td className="px-6 py-3 font-sans text-[14px] text-slate-500">
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
            className="text-[14px] font-bold uppercase tracking-widest text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Trang trước
          </button>
          <span className="font-sans text-[14px] font-bold text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="text-[14px] font-bold uppercase tracking-widest text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
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
  isDiscarding,
  onTrendViewChange,
  onPinTopic,
  onUpdateKnowledge,
  onDiscardTopic,
  linkedDocs = [],
  isConfirmed = false,
  onOpenKnowledgeDrawer,
}: TopicDetailPanelProps) {
  // Confirm modal state
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "pin" | "knowledge" | "discard" | null;
  }>({ open: false, type: null });

  const openPinConfirm = () => setConfirmModal({ open: true, type: "pin" });
  const openKnowledgeConfirm = () => setConfirmModal({ open: true, type: "knowledge" });
  const openDiscardConfirm = () => setConfirmModal({ open: true, type: "discard" });
  const closeConfirm = () => setConfirmModal({ open: false, type: null });

  const handleConfirm = () => {
    if (confirmModal.type === "pin") {
      onPinTopic();
    } else if (confirmModal.type === "knowledge") {
      onUpdateKnowledge();
    } else if (confirmModal.type === "discard") {
      onDiscardTopic();
    }
    closeConfirm();
  };

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
              <p className="text-base text-slate-500">Không thể tải thông tin chủ đề.</p>
            </div>
          ) : !selectedTopic ? (
            <div className="flex flex-col items-center gap-4 pt-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
                <span className="material-symbols-outlined text-4xl text-blue-300">hub</span>
              </div>
              <div>
                <p className="text-base font-medium text-slate-500">Chưa có dữ liệu chủ đề</p>
                <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-900">
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
                    {/* <span className="border border-border-color bg-slate-100 px-2 py-0.5 font-sans text-[14px] uppercase tracking-widest text-slate-500">
                      Mã chủ đề: {selectedTopic.topic_id}
                    </span> */}
                    {selectedTopic.discarded && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-500/10 px-2 py-0.5 text-[16px] font-bold uppercase tracking-wider text-slate-600">
                        <span className="material-symbols-outlined text-[14px]">delete</span>
                        Đã loại bỏ
                      </span>
                    )}
                    {!selectedTopic.discarded && (
                      <>
                        {isConfirmed ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-500/10 px-2 py-0.5 text-[14px] font-bold uppercase tracking-wider text-emerald-600 animate-in fade-in zoom-in-95 duration-200">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Đã xử lý
                          </span>
                        ) : linkedDocs.length > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-500/10 px-2 py-0.5 text-[14px] font-bold uppercase tracking-wider text-blue-600 animate-in fade-in zoom-in-95 duration-200">
                            <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                            Đang xử lý
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-500/10 px-2 py-0.5 text-[14px] font-bold uppercase tracking-wider text-amber-600 animate-in fade-in zoom-in-95 duration-200">
                            <span className="material-symbols-outlined text-[14px]">hourglass_empty</span>
                            Chờ xử lý
                          </span>
                        )}
                      </>
                    )}
                    {selectedTopic.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-2 py-0.5 text-[16px] font-bold uppercase tracking-wider text-red-600">
                        <span className="material-symbols-outlined text-[14px]">push_pin</span>
                        Đã ghim bài lên trang chủ
                      </span>
                    )}
                  </div>
                  <h1 className="text-3xl font-bold text-slate-900">{selectedTopic.title.replace(/_/g, " ")}</h1>
                </div>
                <div className="flex gap-2">
                  {/* <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Chia sẻ"
                  >
                    <span className="material-symbols-outlined text-xl">share</span>
                  </button> */}
                  {/* <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Tải xuống CSV"
                    onClick={handleDownload}
                  >
                    <span className="material-symbols-outlined text-xl">download</span>
                  </button> */}
                  {/* <button
                    type="button"
                    className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white"
                    title="Thêm hành động"
                  >
                    <span className="material-symbols-outlined text-xl">more_horiz</span>
                  </button> */}
                </div>
              </div>

              {/* KPI cards */}
              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-10">
                {/* Featured entity */}
                <div className="rounded-sm border border-white/10 bg-primary p-5 md:col-span-4 overflow-hidden">
                  <div className="mb-1 text-[16px] font-bold uppercase tracking-widest text-white/60">
                    Từ khóa nổi bật
                  </div>
                  <div 
                    className="break-words line-clamp-2 text-3xl font-bold leading-tight text-white"
                    title={selectedTopic.featured_entity.replace(/_/g, " ")}
                  >
                    {selectedTopic.featured_entity.replace(/_/g, " ")}
                  </div>
                  {/* <div className="mt-2 font-mono text-[11px] text-white/60">
                    Tỉ lệ xuất hiện:{" "}
                    <span className="font-bold text-white">
                      {selectedTopic.featured_entity_rate}%
                    </span>
                  </div> */}
                </div>

                {/* Confidence */}
                <div className="rounded-sm border border-border-color bg-white p-5 md:col-span-3">
                  <div className="mb-3 text-[16px] font-bold uppercase tracking-widest text-slate-800">
                    Tỉ lệ xuất hiện của từ khóa
                  </div>
                  <div className="font-sans text-[26px] font-bold leading-none text-slate-900">
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
                  <div className="mb-1 text-[12px] font-bold uppercase tracking-widest text-slate-900">
                    Đồng bộ cuối
                  </div>
                  <div className="font-mono text-xl font-bold text-slate-900">
                    {selectedTopic.sync_ago}
                  </div>
                  <div className="mt-2 flex items-center text-[10px] font-bold uppercase tracking-tight text-emerald-600">
                    <span className="material-symbols-outlined mr-1 text-sm">check_circle</span>
                    {statusBadgeLabel[selectedTopic.status] ?? selectedTopic.status}
                  </div>
                </div> */}
                {/* Queries */}
                <div className="rounded-sm border border-border-color bg-white p-5 md:col-span-3">
                  <div className="mb-6 text-[16px] font-bold uppercase tracking-widest text-slate-900">
                    Số câu hỏi
                  </div>
                  <div className="font-sans text-[26px] font-bold text-slate-900">
                    {selectedTopic.queries}
                  </div>
                  
                </div>
              </div>

              {/* Analysis section */}
              <div className="mb-8 rounded-sm border border-border-color bg-white">
                <div className="flex flex-col items-start justify-between gap-3 border-b border-border-color bg-slate-50/50 px-6 py-3 md:flex-row md:items-center">
                  <h3 className="font-heading text-[14px] font-bold uppercase tracking-wider text-slate-700">
                    Báo cáo Phân tích Chi tiết
                  </h3>
                  {/* Trend view toggle */}
                  <div className="inline-flex rounded-sm border border-border-color bg-white p-0.5">
                    {(["day", "week"/*, "month"*/] as TrendView[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onTrendViewChange(v)}
                        className={`px-3 py-1 text-[12px] font-bold ${
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
                      <h4 className="mb-4 font-heading text-[16px] font-bold uppercase tracking-widest text-slate-900">
                        Từ khóa chính
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTopic.tags.filter(tag => tag.trim()).map((tag) => (
                          <span
                            key={tag}
                            className="break-all rounded-sm border border-border-color bg-slate-100 px-2 py-1 text-[13px] font-medium text-slate-600"
                            title={`Từ khóa: ${tag.replace(/_/g, " ")}`}
                          >
                            {tag.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>

{/* <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[16px] font-bold uppercase tracking-widest text-slate-900">
                          Nguồn dữ liệu trích xuất
                        </h4>
                        <div className="space-y-2">
                          {selectedTopic.sources.map((source) => (
                            <div
                              key={source.label}
                              className="flex items-center justify-between rounded-sm border border-border-color bg-slate-50 p-2 text-sm"
                            >
                              <span className="text-slate-700">{source.label}</span>
                                <span className="font-sans font-bold text-slate-500">{source.percent}</span>
                            </div>
                          ))}
                        </div>
                      </div> */}
                    </div>

                    {/* Right: trend + sentiment */}
                    <div>
                      <h4 className="mb-4 font-heading text-[16px] font-bold uppercase tracking-widest text-slate-900">
                        Xu hướng truy vấn
                      </h4>
                      <TrendChart
                        topicType={topicType}
                        topicId={selectedTopic.topic_id}
                        resultId={selectedTopic.result_id}
                        view={trendView}
                      />

                      <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[16px] font-bold uppercase tracking-widest text-slate-900">
                          Tỉ lệ cảm xúc
                        </h4>
                        <div className="flex flex-col gap-4 sm:flex-row">
                          <div className="flex-1">
                            <div className="mb-1 flex justify-between text-[12px] font-bold">
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
                            <div className="mb-1 flex justify-between text-[12px] font-bold">
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
      <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-center gap-3 border-t border-border-color bg-white/80 p-2 pb-1.5 backdrop-blur-md">
        {/* Pin button */}
        {selectedTopic?.pinned ? (
          <button
            type="button"
            onClick={openPinConfirm}
            disabled={isPinning || isLoading || !selectedTopic || selectedTopic.discarded}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-slate-300 bg-slate-100 px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-slate-500 shadow-sm transition-colors cursor-not-allowed"
            title="Đã ghim trang chủ — bấm để bỏ ghim"
          >
            {isPinning ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">check_circle</span>
            )}
            Đã ghim trang chủ
          </button>
        ) : (
          <button
            type="button"
            onClick={openPinConfirm}
            disabled={isPinning || isLoading || !selectedTopic || selectedTopic.discarded}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-primary bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-primary shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
            title={selectedTopic?.discarded ? "Không thể ghim chủ đề đã loại bỏ" : "Ghim bài viết lên trang chủ"}
          >
            {isPinning && (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            )}
            Thêm bài ghim trang chủ
          </button>
        )}

        {/* Knowledge update button */}
        <button
          type="button"
          onClick={onOpenKnowledgeDrawer}
          disabled={isLoading || !selectedTopic || selectedTopic.discarded}
          className={`inline-flex items-center gap-2 rounded-sm px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-white shadow-lg transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 ${
            isConfirmed 
              ? "bg-emerald-700 hover:bg-emerald-800" 
              : linkedDocs.length > 0 
                ? "bg-primary hover:bg-primary-dark font-semibold" 
                : "bg-primary hover:bg-primary-dark"
          }`}
          title={selectedTopic?.discarded ? "Không thể cập nhật tri thức chủ đề đã loại bỏ" : "Nhấp để đính kèm tài liệu minh chứng & cập nhật tri thức"}
        >
          {isConfirmed ? (
            <span className="material-symbols-outlined text-sm">check_circle</span>
          ) : linkedDocs.length > 0 ? (
            <span className="material-symbols-outlined animate-spin text-sm">sync</span>
          ) : (
            <span className="material-symbols-outlined text-sm">history_edu</span>
          )}
          {isConfirmed ? "Đã xử lý" : linkedDocs.length > 0 ? "Đang xử lý" : "Cập nhật tri thức"}
        </button>

        {/* Discard / Restore button */}
        {selectedTopic?.discarded ? (
          <button
            type="button"
            onClick={openDiscardConfirm}
            disabled={isDiscarding || isLoading || !selectedTopic}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-emerald-500 bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-emerald-600 shadow-sm transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Khôi phục chủ đề"
          >
            {isDiscarding ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">restore</span>
            )}
            Khôi phục
          </button>
        ) : (
          <button
            type="button"
            onClick={openDiscardConfirm}
            disabled={isDiscarding || isLoading || !selectedTopic}
            className="inline-flex items-center gap-2 rounded-sm border-2 border-red-500 bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-widest text-red-600 shadow-sm transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            title="Loại bỏ chủ đề"
          >
            {isDiscarding ? (
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
            ) : (
              <span className="material-symbols-outlined text-sm">delete</span>
            )}
            Loại bỏ
          </button>
        )}
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        open={confirmModal.open}
        type={confirmModal.type}
        topic={selectedTopic}
        isLoading={isPinning || isUpdatingKnowledge || isDiscarding}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
      />
    </section>
  );
}
