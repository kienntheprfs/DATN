import type { MissingInMapStatsData, TabKey } from "./MissingInMapTypes";

type MissingInMapStatsProps = {
  activeTab: TabKey;
  stats: MissingInMapStatsData;
  isLoading: boolean;
};

export function MissingInMapStats({ activeTab, stats, isLoading }: MissingInMapStatsProps) {
  const total = isLoading ? "--" : stats.total;
  const pending = isLoading ? "--" : stats.pending;
  const blindSpots = isLoading ? "--" : activeTab === "location" ? stats.total : stats.pending;

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Tổng số yêu cầu</span>
          <span className="material-symbols-outlined text-[20px] text-green-500">trending_up</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-9 w-20 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-3 h-4 w-28 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-4 h-1.5 w-full overflow-hidden bg-slate-100">
              <div className="h-full w-1/2 animate-pulse bg-slate-200" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <span className="font-mono text-3xl font-extrabold text-text-main">{total}</span>
              <span className="mb-1 text-xs font-bold text-green-600">trong tháng qua</span>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden bg-slate-100">
              <div className="h-full w-[84%] bg-green-500" />
            </div>
          </>
        )}
      </div>

      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Yêu cầu chưa xử lý</span>
          <span className="material-symbols-outlined text-[20px] text-amber-500">pending_actions</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-9 w-16 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-3 h-4 w-32 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-4 flex gap-1">
              <div className="h-1.5 flex-1 bg-slate-100 animate-pulse" />
              <div className="h-1.5 flex-1 bg-slate-100 animate-pulse" />
              <div className="h-1.5 flex-1 bg-slate-100 animate-pulse" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <span className="font-mono text-3xl font-extrabold text-text-main">{pending}</span>
              <span className="mb-1 text-xs font-medium text-slate-500">Cần xem xét ngay</span>
            </div>
            <div className="mt-4 flex gap-1">
              <div className="h-1.5 flex-1 bg-amber-500" />
              <div className="h-1.5 flex-1 bg-amber-500/30" />
              <div className="h-1.5 flex-1 bg-amber-500/30" />
            </div>
          </>
        )}
      </div>

      <div className="border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Điểm mù định danh</span>
          <span className="material-symbols-outlined text-[20px] text-primary">explore_off</span>
        </div>
        {isLoading ? (
          <>
            <div className="h-9 w-16 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-3 h-4 w-40 rounded-sm bg-slate-100 animate-pulse" />
            <div className="mt-4 h-4 w-full rounded-sm bg-slate-100 animate-pulse" />
          </>
        ) : (
          <>
            <div className="flex items-end gap-3">
              <span className="font-mono text-3xl font-extrabold text-text-main">{blindSpots}</span>
              <span className="mb-1 text-xs font-medium text-slate-500">
                {activeTab === "location" ? "Địa điểm thiếu" : "Tuyến đường thiếu"}
              </span>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-slate-400 italic">
              Dữ liệu tổng hợp từ các báo cáo trùng lặp trên bản đồ số khu vực cơ sở 1.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
