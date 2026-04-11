"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAdminStore } from "@/stores/admin.store";

export function AdminSidebar() {
  const { isSidebarOpen, closeSidebar } = useAdminStore();
  const pathname = usePathname();

  const isKnowledgeRoute = pathname.startsWith("/admin/knowledge");
  const isRatingRoute = pathname.startsWith("/admin/rating");
  const isTopicRoute = pathname.startsWith("/admin/topic");
  const isPinnedPostRoute = pathname.startsWith("/admin/pinned_post");
  const isMissingInMapRoute = pathname.startsWith("/admin/missing-in-map");

  // Keep sidebar closed whenever entering mobile breakpoint.
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");

    const handleBreakpointChange = (event: MediaQueryListEvent | MediaQueryList) => {
      if (event.matches) {
        closeSidebar();
      }
    };

    handleBreakpointChange(mediaQuery);

    const listener = (event: MediaQueryListEvent) => {
      handleBreakpointChange(event);
    };

    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }, [closeSidebar]);

  return (
    <>
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-30 md:hidden"
          onClick={closeSidebar}
          onPointerDown={closeSidebar}
          aria-hidden="true"
        />
      )}
      <aside 
        className={`fixed md:relative top-0 left-0 h-full w-65 bg-primary-dark shrink-0 flex-col text-white border-r border-slate-800 z-40 transition-all duration-300 ease-in-out flex
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:-ml-65 pointer-events-none md:pointer-events-auto'}`
        }
        aria-hidden={!isSidebarOpen}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[20px]">school</span>
            </div>
            <div>
              <h1 className="font-heading font-semibold text-[14px] leading-tight text-white mb-0">Academic Nexus</h1>
              <p className="text-xs text-blue-200 font-display mt-0">Hệ thống Tra cứu</p>
            </div>
          </div>
          {/* Close button */}
          <button 
            type="button" 
            className="text-slate-400 hover:text-white p-1"
            onClick={closeSidebar}
            title="Đóng sidebar"
          >
            <span className="material-symbols-outlined text-[20px]">keyboard_double_arrow_left</span>
          </button>
        </div>
      <nav className="flex-1 py-6 px-2 space-y-1">
        <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-blue-200 hover:text-white hover:bg-white/5 transition-colors group">
          <span className="material-symbols-outlined text-[20px]">chat</span>
          <span className="text-sm font-medium">Trò chuyện mới</span>
        </Link>
        <Link
          href="/admin/knowledge"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            isKnowledgeRoute
              ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
              : "text-blue-200 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${isKnowledgeRoute ? "fill-1" : ""}`}>archive</span>
          <span className="text-sm font-medium">Thư viện &amp; Lịch sử</span>
        </Link>
        <div className="pt-4 pb-2">
          <div className="px-3 text-[11px] font-bold text-blue-300/60 uppercase tracking-wider font-heading">Quản trị</div>
        </div>
        <Link
          href="/admin/topic"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            isTopicRoute
              ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
              : "text-blue-200 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${isTopicRoute ? "fill-1" : ""}`}>analytics</span>
          <span className="text-sm font-medium">Phân tích Chủ đề</span>
        </Link>
        <Link
          href="/admin/missing-in-map"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            isMissingInMapRoute
              ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
              : "text-blue-200 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${isMissingInMapRoute ? "fill-1" : ""}`}>conversion_path</span>
          <span className="text-sm font-medium">Dữ liệu bản đồ thiếu</span>
        </Link>
        <Link
          href="/admin/pinned_post"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            isPinnedPostRoute
              ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
              : "text-blue-200 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${isPinnedPostRoute ? "fill-1" : ""}`}>push_pin</span>
          <span className="text-sm font-medium">Quản lý Bài ghim</span>
        </Link>
        <Link
          href="/admin/rating"
          className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
            isRatingRoute
              ? "bg-primary text-white shadow-sm ring-1 ring-white/10"
              : "text-blue-200 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className={`material-symbols-outlined text-[20px] ${isRatingRoute ? "fill-1" : ""}`}>rate_review</span>
          <span className="text-sm font-medium">Đánh giá người dùng</span>
        </Link>
        <Link href="#" className="flex items-center gap-3 px-3 py-2 rounded-md text-blue-200 hover:text-white hover:bg-white/5 transition-colors">
          <span className="material-symbols-outlined text-[20px]">settings</span>
          <span className="text-sm font-medium">Cài đặt API</span>
        </Link>
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white font-mono">
            LH
          </div>
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium text-white truncate">Lê Văn Huy</span>
            <span className="text-xs text-blue-200 truncate">Giảng viên - Khoa KH&amp;KT MT</span>
          </div>
        </div>
      </div>
    </aside>
    </>
  );
}
