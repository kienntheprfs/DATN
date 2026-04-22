import { formatStatus, statusClasses } from "./MissingInMapUtils";
import type { LocationRow } from "./MissingInMapTypes";

type MissingInMapLocationTableProps = {
  rows: LocationRow[];
  isSubmitting: boolean;
  pendingActionId: number | null;
  isLoading?: boolean;
  onAddLocation: (row: LocationRow) => void;
  onRemove: (row: LocationRow) => void;
};

export function MissingInMapLocationTable({
  rows,
  isSubmitting,
  pendingActionId,
  isLoading = false,
  onAddLocation,
  onRemove,
}: MissingInMapLocationTableProps) {
  if (isLoading) {
    return (
      <table className="w-full min-w-270 border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">ID</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Name</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Building Name</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Floor</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Requested By</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Admin Note</th>
            <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Created At</th>
            <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, index) => (
            <tr key={index} className="animate-pulse">
              <td className="px-6 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-14 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-28 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-5 w-20 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-40 rounded bg-slate-100" /></td>
              <td className="px-6 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="h-8 w-24 rounded bg-slate-100" />
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
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Name</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Building Name</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Floor</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Requested By</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Admin Note</th>
          <th className="px-6 py-4 text-[12px] font-bold text-slate-500 uppercase tracking-widest">Created At</th>
          <th className="px-6 py-4 text-right text-[12px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 && (
          <tr>
            <td colSpan={9} className="px-6 py-8 text-center text-sm text-slate-500">
              Không có dữ liệu phù hợp với bộ lọc hiện tại.
            </td>
          </tr>
        )}
        {rows.map((data) => {
          const rowBusy = isSubmitting && pendingActionId === data.rowId;

          return (
            <tr key={data.id} className="transition-colors hover:bg-slate-50/80">
              <td className="px-6 py-4 font-mono text-[13px] font-medium text-slate-600">{data.id}</td>
              <td className="px-6 py-4">
                <div className="text-sm font-bold text-text-main">{data.name}</div>
              </td>
              <td className="px-6 py-4 text-[13px] font-medium text-slate-700">{data.buildingName}</td>
              <td className="px-6 py-4 font-mono text-[13px] text-slate-600">{data.floor}</td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold">
                    {data.requesterRole}
                  </div>
                  <div className="text-[13px] font-medium">{data.requestedBy}</div>
                </div>
              </td>
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
                <div className="max-w-45 truncate text-sm text-slate-700" title={data.adminNote}>
                  {data.adminNote}
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-[12px] text-slate-500">{data.createdAt}</td>
              <td className="px-6 py-4 text-right">
                {data.status === "REMOVED" ? (
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
                      onClick={() => onAddLocation(data)}
                      className="bg-primary px-3 py-1.5 text-[10px] font-bold text-white uppercase shadow-sm transition-all hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
                      title="Thêm địa điểm vào bản đồ"
                    >
                      {rowBusy ? "ĐANG XỬ LÝ" : "THÊM ĐỊA ĐIỂM"}
                    </button>
                    <button
                      type="button"
                      disabled={rowBusy}
                      onClick={() => onRemove(data)}
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
