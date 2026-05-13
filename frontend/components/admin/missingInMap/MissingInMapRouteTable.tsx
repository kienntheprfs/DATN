import { formatStatus, statusClasses } from "./MissingInMapUtils";
import type { RouteRow } from "./MissingInMapTypes";

type MissingInMapRouteTableProps = {
  rows: RouteRow[];
  isSubmitting: boolean;
  pendingActionId: number | null;
  isLoading?: boolean;
  onDrawRoute: (row: RouteRow) => void;
  onRemove: (row: RouteRow) => void;
  onRowClick: (row: RouteRow) => void;
};

export function MissingInMapRouteTable({
  rows,
  isSubmitting,
  pendingActionId,
  isLoading = false,
  onDrawRoute,
  onRemove,
  onRowClick,
}: MissingInMapRouteTableProps) {
  if (isLoading) {
    return (
      <table className="w-full min-w-270 border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">ID</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Điểm bắt đầu</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Điểm kết thúc</th>
            {/* <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Lý do / Ghi chú</th> */}
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Trạng thái</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Người báo cáo</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Ngày tạo</th>
            <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-500 uppercase tracking-widest">Thao tác</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, index) => (
            <tr key={index} className="animate-pulse">
              <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-36 rounded bg-slate-100" /><div className="mt-2 h-3 w-24 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-36 rounded bg-slate-100" /><div className="mt-2 h-3 w-24 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-5 w-20 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="h-8 w-28 rounded bg-slate-100" />
                  <div className="h-8 w-16 rounded bg-slate-100" />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <table className="w-full min-w-270 border-collapse text-left">
      <thead>
        <tr className="border-b border-slate-200 bg-white">
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">ID</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Điểm bắt đầu</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Điểm kết thúc</th>
          {/* <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Lý do / Ghi chú</th> */}
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Trạng thái</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Người báo cáo</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Ngày tạo</th>
          <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-500 uppercase tracking-widest">Thao tác</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} className="px-6 py-8 text-center text-sm text-slate-500">
              Không có dữ liệu phù hợp với bộ lọc hiện tại.
            </td>
          </tr>
        )}
        {rows.map((data) => {
          const rowBusy = isSubmitting && pendingActionId === data.rowId;

          return (
            <tr 
              key={data.id} 
              className="transition-colors hover:bg-slate-50/80 cursor-pointer group"
              onClick={() => onRowClick(data)}
            >
              <td className="px-6 py-4 font-mono text-[13px] font-medium text-slate-600">{data.id}</td>
              <td className="px-6 py-4">
                <div className="text-sm font-bold text-text-main">{data.startPoint}</div>
                <div className="font-mono text-[11px] text-slate-500 uppercase">{data.startMeta}</div>
              </td>
              <td className="px-6 py-4">
                <div className="text-sm font-bold text-text-main">{data.endPoint}</div>
                <div className="font-mono text-[11px] text-slate-500 uppercase">{data.endMeta}</div>
              </td>
              {/* <td className="px-6 py-4">
                <div className="max-w-55 truncate text-sm text-slate-700" title={data.reason}>
                  {data.reason}
                </div>
              </td> */}
              <td className="px-6 py-4">
                <span
                  className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-bold uppercase tracking-tight ${statusClasses(
                    data.status
                  )}`}
                >
                  {formatStatus(data.status)}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold">
                    {data.reporterRole}
                  </div>
                  <div className="text-[13px] font-medium">{data.reportedBy}</div>
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-[12px] text-slate-500">{data.createdAt}</td>
              <td className="px-6 py-4 text-right">
                {data.status === "RESOLVED" ? (
                  <div className="flex justify-end">
                    <span className="material-symbols-outlined text-[24px] text-green-600" title="Yêu cầu đã xử lý">
                      check_circle
                    </span>
                  </div>
                ) : data.status === "REMOVED" ? (
                  <div className="flex justify-end">
                    <span className="inline-flex items-center rounded-sm border border-slate-600 bg-slate-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-tight text-white">
                      ĐÃ LOẠI BỎ
                    </span>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDrawRoute(data);
                      }}
                      className="bg-primary px-3 py-1.5 text-[10px] font-bold text-white uppercase shadow-sm transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                      title="Vẽ tuyến đường lên bản đồ"
                    >
                      {rowBusy ? "ĐANG XỬ LÝ" : "VẼ TUYẾN ĐƯỜNG"}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemove(data);
                      }}
                      className="border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-600 uppercase transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Loại bỏ yêu cầu"
                    >
                      LOẠI BỎ
                    </button>
                  </div>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
