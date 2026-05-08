import { statusBadgeClass, statusBadgeLabel } from "./TopicData";
import type { TopicStatus } from "./TopicTypes";

type TopicStatusPillProps = {
  status: TopicStatus;
  pinned?: boolean;
  knowledgeUpdated?: boolean;
};

export function TopicStatusPill({ status, pinned, knowledgeUpdated }: TopicStatusPillProps) {
  const cls = statusBadgeClass[status] ?? statusBadgeClass.waiting;
  const label = statusBadgeLabel[status] ?? status;

  return (
    <>
      {pinned && (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-600">
          <span className="material-symbols-outlined text-[10px]">push_pin</span>
          Đã ghim
        </span>
      )}

      {knowledgeUpdated && (
        <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-500/10 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pink-600">
          <span className="material-symbols-outlined text-[10px]">history_edu</span>
          Đã cập nhật tri thức
        </span>
      )}

      {!pinned && !knowledgeUpdated && (
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
        >
          <span className="material-symbols-outlined text-[10px]">new_releases</span>
          {label}
        </span>
      )}
    </>
  );
}
