"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { KnowledgeDataPanel } from "@/components/admin/knowledge/KnowledgeDataPanel";
import { KnowledgeFilters, SearchFilterPanel } from "@/components/admin/knowledge/SearchFilterPanel";
import { UploadModal } from "@/components/admin/knowledge/UploadModal";

export default function KnowledgePage() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);

  const initialFilters = useMemo<KnowledgeFilters>(() => ({
    search: "",
    year: "all",
    unit: "all",
    documentType: "all",
    docClass: "all",
  }), []);

  const [draftFilters, setDraftFilters] = useState<KnowledgeFilters>(initialFilters);
  const debouncedFilters = useDeferredValue(draftFilters);

  return (
    <div className="max-w-400 mx-auto w-full flex flex-col md:h-full">
        <div className="flex flex-col gap-6 mb-6 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">Quản lý cơ sở tri thức</h1>
              <p className="text-sm text-text-secondary mt-1">Quản lý văn bản thường, formal document và theo dõi trạng thái xử lý AI.</p>
            </div>
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center justify-center gap-2 bg-primary hover:bg-blue-800 text-white px-4 py-2 rounded-md shadow-sm transition-colors text-sm font-medium w-full sm:w-auto"
            >
              <span className="material-symbols-outlined text-[18px]">upload_file</span>
              <span>Tải lên văn bản mới</span>
            </button>
          </div>
        </div>

        <SearchFilterPanel filters={draftFilters} onFiltersChange={setDraftFilters} />

        <KnowledgeDataPanel filters={debouncedFilters} reloadSignal={reloadSignal} />

        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploaded={() => setReloadSignal((prev) => prev + 1)}
        />
    </div>
  );
}
