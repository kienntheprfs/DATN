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