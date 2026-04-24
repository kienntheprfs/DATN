import { statusBadgeClass, statusBadgeLabel } from "./TopicData";
import type { TopicItem } from "./TopicTypes";

type TopicStatusPillProps = {
  topic: TopicItem;
};

export function TopicStatusPill({ topic }: TopicStatusPillProps) {
  if (topic.pinned) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-600">
        <span className="material-symbols-outlined text-[10px]">push_pin</span>
        Đã ghim
      </span>
    );
  }

  if (topic.knowledgeUpdated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pink-600">
        <span className="material-symbols-outlined text-[10px]">history_edu</span>
        Đã cập nhật tri thức
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${statusBadgeClass[topic.status]}`}>
      <span className="material-symbols-outlined text-[10px]">new_releases</span>
      {statusBadgeLabel[topic.status]}
    </span>
  );
}
