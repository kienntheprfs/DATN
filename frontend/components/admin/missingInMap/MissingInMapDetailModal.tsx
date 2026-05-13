import React from "react";
import type { LocationRow, RouteRow, Status } from "./MissingInMapTypes";
import { formatStatus, statusClasses } from "./MissingInMapUtils";

interface MissingInMapDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: LocationRow | RouteRow | null;
  type: "location" | "route";
}

export function MissingInMapDetailModal({ isOpen, onClose, data, type }: MissingInMapDetailModalProps) {
  if (!isOpen || !data) return null;

  const isLocation = type === "location";
  const locationData = data as LocationRow;
  const routeData = data as RouteRow;

  return (
    <div 
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]" 
        style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-2xl">
              {isLocation ? "location_on" : "conversion_path"}
            </span>
            <div>
              <h2 className="font-heading font-bold text-lg text-text-main leading-none">
                Chi tiết yêu cầu {data.id}
              </h2>
              <p className="text-[11px] text-slate-500 font-mono mt-1 uppercase tracking-wider">
                {isLocation ? "Địa điểm thiếu" : "Tuyến đường thiếu"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
            <span className="material-symbols-outlined text-[24px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-8 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Main Info Section */}
            <div className="md:col-span-2 flex items-center justify-between bg-slate-50 p-4 border border-slate-100">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Trạng thái hiện tại</span>
                <span
                  className={`inline-flex items-center justify-center text-center rounded-full px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-tight ${statusClasses(
                    data.status
                  )}`}
                >
                  {formatStatus(data.status)}
                </span>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ngày gửi yêu cầu</span>
                <span className="text-sm font-mono font-medium text-slate-700">{data.createdAt}</span>
              </div>
            </div>

            {isLocation ? (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Tên địa điểm</label>
                  <p className="text-base font-bold text-text-main">{locationData.name}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Vị trí (Tòa/Tầng)</label>
                  <p className="text-base font-medium text-slate-700">
                    {locationData.buildingName} / {locationData.floor}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Điểm bắt đầu</label>
                  <p className="text-base font-bold text-text-main">{routeData.startPoint}</p>
                  <p className="text-[11px] font-mono text-slate-500 uppercase">{routeData.startMeta}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Điểm kết thúc</label>
                  <p className="text-base font-bold text-text-main">{routeData.endPoint}</p>
                  <p className="text-[11px] font-mono text-slate-500 uppercase">{routeData.endMeta}</p>
                </div>
              </>
            )}

            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                {isLocation ? "Ghi chú / Mô tả" : "Lý do báo thiếu"}
              </label>
              <div className="bg-slate-50 rounded-sm border border-slate-200 p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {isLocation ? locationData.adminNote : routeData.reason}
              </div>
            </div>

            <div className="md:col-span-2 border-t border-slate-100 pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 text-xl font-bold border border-slate-200">
                  {isLocation ? locationData.requesterRole : routeData.reporterRole}
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                    {isLocation ? "Người yêu cầu" : "Người báo cáo"}
                  </label>
                  <p className="text-base font-bold text-text-main">
                    {isLocation ? locationData.requestedBy : routeData.reportedBy}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isLocation ? "Sinh viên / Người dùng hệ thống" : "Người đóng góp tuyến đường"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white border border-slate-300 text-slate-600 text-sm font-bold uppercase tracking-wider hover:bg-slate-100 transition-colors shadow-sm"
            style={{ borderRadius: 0 }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
