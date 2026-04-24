import type { TabKey } from "./MissingInMapTypes";

type MissingInMapHeaderProps = {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
};

export function MissingInMapHeader({ activeTab, onTabChange }: MissingInMapHeaderProps) {
  return (
    <>
      <div className="mb-5 flex items-center gap-1 text-[13px] font-medium">
        <button
          type="button"
          className={`border-b-2 py-2 transition-colors ${
            activeTab === "location"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-slate-500 hover:text-primary"
          }`}
          onClick={() => onTabChange("location")}
          title="Chuyển sang tab Địa điểm"
        >
          Địa điểm
        </button>
        <span className="mx-1 text-slate-300">/</span>
        <button
          type="button"
          className={`border-b-2 py-2 transition-colors ${
            activeTab === "route"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-slate-500 hover:text-primary"
          }`}
          onClick={() => onTabChange("route")}
          title="Chuyển sang tab Tuyến đường"
        >
          Tuyến đường
        </button>
      </div>

      <nav className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <span>Admin</span>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span>Map Data</span>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        <span className="text-primary">Missing Locations &amp; Routes</span>
      </nav>

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-text-main">Quản lý Dữ liệu Bản đồ Thiếu</h1>
          <p className="mt-1 text-sm text-slate-500">
            Hệ thống quản lý và xử lý các điểm mù địa điểm và tuyến đường trong khuôn viên đại học.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            title="Mở bộ lọc dữ liệu"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            <span>Lọc dữ liệu</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            title="Xuất báo cáo tổng hợp"
          >
            <span className="material-symbols-outlined text-[18px]">export_notes</span>
            <span>Xuất báo cáo</span>
          </button>
        </div>
      </div>
    </>
  );
}
