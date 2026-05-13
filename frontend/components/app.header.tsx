"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAgent } from "@/contexts/agent-context";
import { Loader2, Settings } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/use-page-title";

const routeDictionary: Record<string, string> = {
	dashboard: "Bảng điều khiển",
	history: "Lịch sử tra cứu",
	settings: "Cấu hình hệ thống",
	knowledge: "Cơ sở tri thức",
	navigation: "Tìm đường",
	chat: "Trò chuyện với AI",
	// Admin routes
	admin: "Quản trị",
	topic: "Phân tích Chủ đề",
	rating: "Đánh giá người dùng",
	"pinned-post": "Quản lý Bài ghim",
	"missing-in-map": "Dữ liệu Bản đồ Thiếu",
	editor: "Chỉnh sửa bản đồ",
	faq: "Câu hỏi thường gặp",
};

function StatusBadge() {
	const { isOnline, isLoading } = useAgent();

	if (isLoading) {
		return (
			<div className="flex items-center gap-1.5 px-2 py-1 bg-surface-bg border border-border-color rounded-sm">
				<Loader2 className="w-3 h-3 animate-spin text-text-secondary" />
				<span className="text-xs font-mono text-text-secondary">Loading...</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 px-2 py-1 bg-surface-bg border border-border-color rounded-sm">
			<span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
			<span className="text-xs font-mono text-text-secondary uppercase">
				{isOnline ? "Active" : "Inactive"}
			</span>
		</div>
	);
}

export function AppHeader() {
	const pathname = usePathname();
	usePageTitle();
	const pathSegments = pathname === "/" ? [] : pathname.split("/").filter((segment) => segment);

	return (
		<header className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
			<SidebarTrigger className="-ml-3" />

			<div className="mr-2 h-4 w-px bg-border" />

			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem className="hidden md:block">
						<BreadcrumbLink asChild>
							<Link href="/">Trang chủ</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>

					{pathSegments.length > 0 && <BreadcrumbSeparator className="hidden md:block" />}

					{pathSegments.map((segment, index) => {
						const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
						const isLast = index === pathSegments.length - 1;
						const title = routeDictionary[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

						return (
							<React.Fragment key={href}>
								<BreadcrumbItem>
									{isLast ? (
										<BreadcrumbPage>{title}</BreadcrumbPage>
									) : (
										<BreadcrumbLink asChild>
											<Link href={href}>{title}</Link>
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>

								{!isLast && <BreadcrumbSeparator />}
							</React.Fragment>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>

			<div className="ml-auto flex items-center gap-3">
				<StatusBadge />
			</div>
		</header>
	);
}
