"use client";

import React from "react";

export interface KnowledgeFilters {
  search: string;
  year: string;
  unit: string;
  documentType: string;
  docClass: "all" | "normal" | "formal";
}

interface SearchFilterPanelProps {
  filters: KnowledgeFilters;
  onFiltersChange: (filters: KnowledgeFilters) => void;
}

export function SearchFilterPanel({ filters, onFiltersChange }: SearchFilterPanelProps) {
  const updateFilter = <K extends keyof KnowledgeFilters>(key: K, value: KnowledgeFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

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
            onChange={(e) => updateFilter("search", e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md leading-5 bg-white placeholder-slate-400 focus:outline-none focus:placeholder-slate-300 focus:border-primary focus:ring-1 focus:ring-primary sm:text-sm transition-all" 
          />
        </div>
      </div>
      
      <div className="w-full sm:w-35">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Năm ban hành</label>
        <select 
          value={filters.year}
          onChange={(e) => updateFilter("year", e.target.value)}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
        </select>
      </div>
      
      <div className="w-full sm:w-45">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Đơn vị ban hành</label>
        <select 
          value={filters.unit}
          onChange={(e) => updateFilter("unit", e.target.value)}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả đơn vị</option>
          <option value="Phòng Đào Tạo">Phòng Đào Tạo</option>
          <option value="P. CTCT-SV">P. CTCT-SV</option>
          <option value="Phòng TCCB">Phòng TCCB</option>
          <option value="Ban Giám Hiệu">Ban Giám Hiệu</option>
        </select>
      </div>
      
      <div className="w-full sm:w-40">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Loại văn bản</label>
        <select 
          value={filters.documentType}
          onChange={(e) => updateFilter("documentType", e.target.value)}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all">
          <option value="all">Tất cả loại</option>
          <option value="Quyết định">Quyết định</option>
          <option value="Thông báo">Thông báo</option>
          <option value="Quy chế">Quy chế</option>
          <option value="Hướng dẫn">Hướng dẫn</option>
        </select>
      </div>
      
      <div className="w-full sm:w-42.5">
        <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5 ml-1">Nhóm tài liệu</label>
        <select
          value={filters.docClass}
          onChange={(e) => updateFilter("docClass", e.target.value as KnowledgeFilters["docClass"])}
          className="block w-full pl-3 pr-8 py-2 text-base border border-slate-300 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm rounded-md bg-white transition-all"
        >
          <option value="all">Tất cả</option>
          <option value="normal">Normal document</option>
          <option value="formal">Formal document</option>
        </select>
      </div>
    </div>
  );
}
