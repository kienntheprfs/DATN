import { statusBadgeClass, statusBadgeLabel } from "./TopicData";
import type { TopicStatus } from "./TopicTypes";

type TopicStatusPillProps = {
  status: TopicStatus;
  pinned?: boolean;
  knowledgeUpdated?: boolean;
  discarded?: boolean;
  linkedDocsCount?: number;
  isConfirmed?: boolean;
};

export function TopicStatusPill({
  status,
  pinned,
  knowledgeUpdated,
  discarded,
  linkedDocsCount = 0,
  isConfirmed = false,
}: TopicStatusPillProps) {
  const cls = statusBadgeClass[status] ?? statusBadgeClass.waiting;
  const label = statusBadgeLabel[status] ?? status;

  return (
    <>
      {discarded && (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px]">delete</span>
          Đã loại bỏ
        </span>
      )}

      {!discarded && pinned && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-600 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px]">push_pin</span>
          Đã ghim
        </span>
      )}

      {!discarded && (knowledgeUpdated || isConfirmed) && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-600 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px]">check_circle</span>
          Đã cập nhật tri thức
        </span>
      )}

      {!discarded && !(knowledgeUpdated || isConfirmed) && linkedDocsCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-blue-600 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px] animate-spin">sync</span>
          Đang xử lý
        </span>
      )}

      {!discarded && !(knowledgeUpdated || isConfirmed) && linkedDocsCount === 0 && (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 whitespace-nowrap">
          <span className="material-symbols-outlined text-[12px]">hourglass_empty</span>
          Chờ xử lý
        </span>
      )}
    </>
  );
}

