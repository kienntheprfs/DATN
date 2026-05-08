"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const routeTitles: Record<string, string> = {
	"/": "Trang chủ",
	"/chat": "Trò chuyện với AI",
	"/history": "Lịch sử tra cứu",
	"/knowledge": "Kho văn bản",
	"/profile": "Hồ sơ cá nhân",
	"/events": "Sự kiện",
	"/navigation": "Tìm đường",
	"/navigation/editor": "Chỉnh sửa bản đồ",
	"/auth": "Đăng nhập",
	"/auth/callback": "Đăng nhập Google",
	// Admin routes
	"/admin": "Quản trị",
	"/admin/knowledge": "Cơ sở tri thức",
	"/admin/topic": "Phân tích Chủ đề",
	"/admin/rating": "Đánh giá người dùng",
	"/admin/pinned-post": "Quản lý Bài ghim",
	"/admin/missing-in-map": "Dữ liệu Bản đồ Thiếu",
	"/faq": "Câu hỏi thường gặp",
};

export function usePageTitle() {
	const pathname = usePathname();

	useEffect(() => {
		const title = routeTitles[pathname];
		if (title) {
			document.title = `${title} - Hệ thống Hỗ trợ sinh viên`;
		}
	}, [pathname]);
}