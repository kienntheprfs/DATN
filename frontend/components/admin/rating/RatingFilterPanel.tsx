"use client";

import React from "react";

export interface RatingFilters {
  fromDate: string;
  toDate: string;
  search: string;
  rating: "all" | "positive" | "negative";
}

interface RatingFilterPanelProps {
  filters: RatingFilters;
  onFiltersChange: (filters: RatingFilters) => void;
  onApply: () => void;
  onExport: () => void;
  onPrint: () => void;
}

export function RatingFilterPanel({
  filters,
  onFiltersChange,
  onApply,
  onExport,
  onPrint,
}: RatingFilterPanelProps) {
  return (
    <div className="flex flex-col gap-4 mb-4 bg-surface p-4 rounded-md border border-border-color shadow-subtle shrink-0">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-full sm:w-45">
          <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Từ ngày</label>
          <input
            type="date"
            value={filters.fromDate}
            onChange={(event) => onFiltersChange({ ...filters, fromDate: event.target.value })}
            className="block w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white h-9.5 text-text-main"
          />
        </div>

        <div className="w-full sm:w-45">
          <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Đến ngày</label>
          <input
            type="date"
            value={filters.toDate}
            onChange={(event) => onFiltersChange({ ...filters, toDate: event.target.value })}
            className="block w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary bg-white h-9.5 text-text-main"
          />
        </div>

        <div className="w-full lg:flex-1 lg:min-w-75">
          <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Tìm kiếm</label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[20px]">search</span>
            </div>
            <input
              type="text"
              placeholder="Search toàn bảng..."
              value={filters.search}
              onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:placeholder-slate-300 focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm transition-all h-9.5"
            />
          </div>
        </div>

        <div className="w-full sm:w-35">
          <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Rating</label>
          <select
            value={filters.rating}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                rating: event.target.value as RatingFilters["rating"],
              })
            }
            className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white h-9.5"
          >
            <option value="all">Tất cả</option>
            <option value="positive">Hài lòng</option>
            <option value="negative">Không hài lòng</option>
          </select>
        </div>

        <button
          type="button"
          onClick={onApply}
          className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary h-9.5 transition-colors"
        >
          Lọc
        </button>
      </div>

      <div className="flex flex-wrap gap-3 pt-1">
        <button
          type="button"
          onClick={onExport}
          title="Export Excel"
          className="flex items-center gap-2 bg-white border border-border-color hover:bg-slate-50 text-text-main px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium"
        >
          <span className="material-symbols-outlined text-[18px]">table_view</span>
          <span>Export Excel</span>
        </button>

        <button
          type="button"
          onClick={onPrint}
          title="In danh sách"
          className="flex items-center gap-2 bg-white border border-border-color hover:bg-slate-50 text-text-main px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium"
        >
          <span className="material-symbols-outlined text-[18px]">print</span>
          <span>Print</span>
        </button>
      </div>
    </div>
  );
}
