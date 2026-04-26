"use client";

import React from "react";

interface RatingPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

function buildPages(currentPage: number, totalPages: number): Array<number | "..."> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [1, "...", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }

  return [1, "...", currentPage - 1, currentPage, currentPage + 1, "...", totalPages];
}

export function RatingPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: RatingPaginationProps) {
  const hasData = totalItems > 0;
  const startItem = hasData ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = hasData ? Math.min(currentPage * itemsPerPage, totalItems) : 0;
  const pages = buildPages(currentPage, totalPages);

  return (
    <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-border-color shrink-0">
      <div className="sm:flex-1 sm:flex sm:items-center sm:justify-between w-full gap-3">
        <div>
          <p className="text-sm text-text-secondary">
            Hiển thị <span className="font-medium text-text-main">{startItem}</span> đến <span className="font-medium text-text-main">{endItem}</span> trong số <span className="font-medium text-text-main">{totalItems.toLocaleString()}</span> kết quả
          </p>
        </div>
        <div>
          <nav aria-label="Pagination" className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1 || !hasData}
              className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Previous</span>
              <span className="material-symbols-outlined text-[16px]">chevron_left</span>
            </button>

            {pages.map((page, index) =>
              page === "..." ? (
                <span
                  key={`ellipsis-${index}`}
                  className="relative inline-flex items-center px-4 py-2 border border-slate-300 bg-white text-sm font-medium text-slate-700"
                >
                  ...
                </span>
              ) : (
                <button
                  type="button"
                  key={page}
                  onClick={() => onPageChange(page)}
                  disabled={!hasData}
                  className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                    currentPage === page
                      ? "z-10 bg-blue-50 border-primary text-primary"
                      : "bg-white border-slate-300 text-slate-500 hover:bg-slate-50"
                  }`}
                  aria-current={currentPage === page ? "page" : undefined}
                >
                  {page}
                </button>
              ),
            )}

            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages || !hasData}
              className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-slate-300 bg-white text-sm font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Next</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          </nav>
        </div>
      </div>
    </div>
  );
}
