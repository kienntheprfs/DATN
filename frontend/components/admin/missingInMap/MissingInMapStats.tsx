import type { TabKey } from "./MissingInMapTypes";

type MissingInMapStatsProps = {
  activeTab: TabKey;
};

export function MissingInMapStats({ activeTab }: MissingInMapStatsProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tổng số yêu cầu</span>
          <span className="material-symbols-outlined text-[20px] text-green-500">trending_up</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="font-mono text-3xl font-extrabold text-text-main">84</span>
          <span className="mb-1 text-xs font-bold text-green-600">trong tháng qua</span>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden bg-slate-100">
          <div className="h-full w-[84%] bg-green-500" />
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Yêu cầu chưa xử lý</span>
          <span className="material-symbols-outlined text-[20px] text-amber-500">pending_actions</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="font-mono text-3xl font-extrabold text-text-main">12</span>
          <span className="mb-1 text-xs font-medium text-slate-500">Cần xem xét ngay</span>
        </div>
        <div className="mt-4 flex gap-1">
          <div className="h-1.5 flex-1 bg-amber-500" />
          <div className="h-1.5 flex-1 bg-amber-500/30" />
          <div className="h-1.5 flex-1 bg-amber-500/30" />
        </div>
      </div>

      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Điểm mù định danh</span>
          <span className="material-symbols-outlined text-[20px] text-primary">explore_off</span>
        </div>
        <div className="flex items-end gap-3">
          <span className="font-mono text-3xl font-extrabold text-text-main">42</span>
          <span className="mb-1 text-xs font-medium text-slate-500">
            {activeTab === "location" ? "Địa điểm thiếu" : "Tuyến đường thiếu"}
          </span>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-slate-400 italic">
          Dữ liệu tổng hợp từ các báo cáo trùng lặp trên bản đồ số khu vực cơ sở 1.
        </p>
      </div>
    </div>
  );
}
