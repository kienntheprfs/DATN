type MissingInMapPaginationProps = {
  safeCurrentPage: number;
  pageCount: number;
  onPageChange: (page: number) => void;
};

export function MissingInMapPagination({
  safeCurrentPage,
  pageCount,
  onPageChange,
}: MissingInMapPaginationProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 bg-white p-4 md:p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-xs text-slate-500">Hiển thị 10 dòng trên mỗi trang</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={safeCurrentPage === 1}
          className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-400 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Trang đầu"
        >
          <span className="material-symbols-outlined text-[18px]">first_page</span>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, safeCurrentPage - 1))}
          disabled={safeCurrentPage === 1}
          className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-400 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Trang trước"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>

        <div className="flex items-center gap-1 px-3">
          {Array.from({ length: pageCount }).map((_, index) => {
            const page = index + 1;
            const active = page === safeCurrentPage;

            return (
              <button
                type="button"
                key={page}
                onClick={() => onPageChange(page)}
                className={`flex h-8 w-8 items-center justify-center text-xs font-medium transition-colors ${
                  active ? "bg-primary text-white" : "text-slate-700 hover:bg-slate-100"
                }`}
                title={`Trang ${page}`}
              >
                {page}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onPageChange(Math.min(pageCount, safeCurrentPage + 1))}
          disabled={safeCurrentPage === pageCount}
          className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Trang sau"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
        <button
          type="button"
          onClick={() => onPageChange(pageCount)}
          disabled={safeCurrentPage === pageCount}
          className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Trang cuối"
        >
          <span className="material-symbols-outlined text-[18px]">last_page</span>
        </button>
      </div>
    </div>
  );
}
