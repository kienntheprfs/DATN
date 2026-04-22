import type { Status, StatusFilterOption, TabKey } from "./MissingInMapTypes";

type MissingInMapControlsProps = {
  activeTab: TabKey;
  locationTotal: number;
  routeTotal: number;
  search: string;
  statusFilter: "ALL" | Status;
  statusOptions: StatusFilterOption[];
  rangeStart: number;
  rangeEnd: number;
  totalResults: number;
  isLoading?: boolean;
  onTabChange: (tab: TabKey) => void;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: "ALL" | Status) => void;
};

export function MissingInMapControls({
  activeTab,
  locationTotal,
  routeTotal,
  search,
  statusFilter,
  statusOptions,
  rangeStart,
  rangeEnd,
  totalResults,
  isLoading = false,
  onTabChange,
  onSearchChange,
  onStatusFilterChange,
}: MissingInMapControlsProps) {
  const rangeLabel = isLoading ? "--" : `${rangeStart}-${rangeEnd}`;
  const totalLabel = isLoading ? "--" : totalResults;

  return (
    <>
      <div className="flex gap-2 overflow-x-auto border-b border-slate-200 px-3 md:gap-8 md:px-6">
        <button
          type="button"
          className={`inline-flex items-center gap-2 border-b-2 px-2 py-4 text-sm whitespace-nowrap transition-all md:px-4 ${
            activeTab === "location"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-slate-500 font-medium hover:text-primary"
          }`}
          onClick={() => onTabChange("location")}
          title="Xem danh sách địa điểm thiếu"
        >
          <span className="material-symbols-outlined text-lg">location_on</span>
          <span>Địa điểm</span>
          <span className="ml-1 rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-primary">{isLoading ? "--" : locationTotal}</span>
        </button>
        <button
          type="button"
          className={`inline-flex items-center gap-2 border-b-2 px-2 py-4 text-sm whitespace-nowrap transition-all md:px-4 ${
            activeTab === "route"
              ? "border-primary text-primary font-bold"
              : "border-transparent text-slate-500 font-medium hover:text-primary"
          }`}
          onClick={() => onTabChange("route")}
          title="Xem danh sách tuyến đường thiếu"
        >
          <span className="material-symbols-outlined text-lg">conversion_path</span>
          <span>Tuyến đường</span>
          <span className="ml-1 rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-primary">{isLoading ? "--" : routeTotal}</span>
        </button>
      </div>

      <div className="flex flex-col justify-between gap-3 border-b border-slate-100 bg-slate-50/50 p-4 lg:flex-row lg:items-center">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative">
            <span className="material-symbols-outlined absolute top-1/2 left-3 -translate-y-1/2 text-[20px] text-slate-400">search</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full border border-slate-200 bg-white py-2 pr-4 pl-10 text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none sm:w-80"
              placeholder={
                activeTab === "location"
                  ? "Tìm kiếm địa điểm..."
                  : "Tìm kiếm theo ID hoặc người gửi..."
              }
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as "ALL" | Status)}
            className="border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[12px] font-medium text-slate-500">
          Hiển thị <span className="font-mono font-bold text-text-main">{rangeLabel}</span> trong{" "}
          <span className="font-mono font-bold text-text-main">{totalLabel}</span> kết quả
        </div>
      </div>
    </>
  );
}
