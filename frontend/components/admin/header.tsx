"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminStore } from "@/stores/admin.store";

export function AdminHeader() {
  const { toggleSidebar } = useAdminStore();
  const pathname = usePathname();

  const breadcrumbLabel = pathname.startsWith("/admin/rating")
    ? "Bình luận của người dùng"
    : pathname.startsWith("/admin/topic")
      ? "Quản lý Chủ đề Phổ biến"
    : pathname.startsWith("/admin/missing-in-map")
      ? "Quản lý Dữ liệu Bản đồ Thiếu"
    : pathname.startsWith("/admin/pinned_post")
      ? "Quản lý Bài ghim"
    : pathname.startsWith("/admin/knowledge")
      ? "Thư viện & Lịch sử"
      : "Trang quản trị";

  return (
    <header className="h-15 md:h-12 bg-surface border-b border-border-color flex items-center px-4 md:px-6 justify-between shrink-0">
      <div className="flex items-center gap-3">
        <button 
          className="p-1 text-text-secondary hover:text-primary transition-colors inline-flex items-center justify-center -ml-2"
          onClick={toggleSidebar}
        >
          <span className="material-symbols-outlined text-[24px]">menu</span>
        </button>
        <nav className="hidden sm:flex items-center text-xs text-text-secondary font-display">
          <Link href="#" className="hover:text-primary transition-colors">
            Trang chủ
          </Link>
          <span className="mx-2 text-slate-300">/</span>
          <span className="font-medium text-text-main">{breadcrumbLabel}</span>
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <button className="text-text-secondary hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-[20px]">notifications</span>
        </button>
        <div className="h-4 w-px bg-slate-200"></div>
        <button className="text-text-secondary hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-[20px]">help</span>
        </button>
      </div>
    </header>
  );
}
