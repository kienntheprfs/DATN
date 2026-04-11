"use client";

import React from "react";

interface SearchFilterPanelProps {
  filters: {
    search: string;
    year: string;
    unit: string;
    type: string;
  };
  setFilters: (filters: any) => void;
}

export function SearchFilterPanel({ filters, setFilters }: SearchFilterPanelProps) {
  return (
    <div className="flex flex-col sm:flex-row flex-wrap items-end gap-4 mb-4 bg-surface p-4 rounded-md border border-border-color shadow-subtle shrink-0">
      <div className="flex-1 w-full sm:w-auto">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Từ khóa tìm kiếm</label>
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[20px]">search</span>
          </div>
          <input 
            type="text" 
            placeholder="Nhập tên văn bản, số hiệu hoặc nội dung trích yếu..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:placeholder-slate-300 focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm transition-all" 
          />
        </div>
      </div>
      
      <div className="w-full sm:w-[140px]">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Năm ban hành</label>
        <select 
          value={filters.year}
          onChange={(e) => setFilters({ ...filters, year: e.target.value })}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
          <option value="before2022">Trước 2022</option>
        </select>
      </div>
      
      <div className="w-full sm:w-[180px]">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Đơn vị ban hành</label>
        <select 
          value={filters.unit}
          onChange={(e) => setFilters({ ...filters, unit: e.target.value })}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả đơn vị</option>
          <option value="training">Phòng Đào Tạo</option>
          <option value="student">Phòng CTCT-SV</option>
          <option value="personnel">Phòng TCCB</option>
          <option value="board">Ban Giám Hiệu</option>
        </select>
      </div>
      
      <div className="w-full sm:w-[160px]">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Loại văn bản</label>
        <select 
          value={filters.type}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả loại</option>
          <option value="decision">Quyết định</option>
          <option value="notice">Thông báo</option>
          <option value="regulation">Quy chế</option>
          <option value="guide">Hướng dẫn</option>
        </select>
      </div>
      
      <div className="w-full sm:w-auto mt-2 sm:mt-0">
        <button className="flex justify-center w-full sm:inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-primary bg-blue-50 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary h-[38px]">
          <span className="material-symbols-outlined text-[18px] mr-2">filter_list</span>
          Lọc
        </button>
      </div>
    </div>
  );
}
