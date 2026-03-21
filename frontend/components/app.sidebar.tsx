"use client";

import { useEffect } from "react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
	ChevronRight,
	ChevronsUpDown,
	GalleryVerticalEnd,
	MessageSquare,
	ScrollText,
	History,
	Bookmark,
	Settings,
	MoreHorizontal,
	LogIn,
	Loader2, // Thêm icon loading
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Link from "next/link";
import { useAppStore } from "@/stores/app.store";

const data = {
	navMain: [
		{
			title: "Tra cứu hỏi đáp",
			url: "#",
			icon: MessageSquare,
			isActive: true,
		},
		{
			title: "Kho văn bản",
			url: "#",
			icon: ScrollText,
			isActive: true,
		},
		{
			title: "Lịch sử tra cứu",
			url: "#",
			icon: History,
			isActive: true,
			isDynamicHistory: true, // Cờ nhận diện mục lấy từ API
		},
		{
			title: "Đã lưu",
			url: "#",
			icon: Bookmark,
			isActive: true,
		},
	],
};

export function AppSidebar() {
	// 1. Kéo data và action từ Zustand
	const { user, history, isLoadingHistory, hasMoreHistory, login, logout, fetchMoreHistory } = useAppStore();

	// 2. Tự động load lịch sử lần đầu tiên khi mở web
	useEffect(() => {
		if (history.length === 0 && hasMoreHistory && !isLoadingHistory) {
			fetchMoreHistory();
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<Sidebar>
			{/* --- H E A D E R --- */}
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuButton size="lg" className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground">
									<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-black text-white">
										<GalleryVerticalEnd className="size-4" />
									</div>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-semibold">BK-TBOT</span>
										<span className="truncate text-xs">HCMUT</span>
									</div>
									<ChevronsUpDown className="ml-auto size-4" />
								</SidebarMenuButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[--radix-popper-anchor-width]">
								<DropdownMenuItem>Workspace 1</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>

			{/* --- C O N T E N T --- */}
			<SidebarContent>
				<SidebarGroup>
					<SidebarMenu>
						{data.navMain.map((item) => {
							// TRƯỜNG HỢP 1: MỤC LỊCH SỬ (Gọi API)
							if (item.isDynamicHistory) {
								return (
									<Collapsible key={item.title} defaultOpen={item.isActive} className="group/collapsible">
										<SidebarMenuItem>
											<CollapsibleTrigger asChild>
												<SidebarMenuButton tooltip={item.title}>
													{item.icon && <item.icon />}
													<span>{item.title}</span>
													<ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
												</SidebarMenuButton>
											</CollapsibleTrigger>

											<CollapsibleContent>
												<SidebarMenuSub>
													{/* Trạng thái 1: Đang tải lần đầu tiên */}
													{isLoadingHistory && history.length === 0 ? (
														<SidebarMenuSubItem>
															<SidebarMenuSubButton className="opacity-50 pointer-events-none text-muted-foreground">
																<Loader2 className="size-4 animate-spin" />
																<span>Đang tải lịch sử...</span>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													) : history.length > 0 ? (
														<>
															{history.map((historyItem) => (
																<SidebarMenuSubItem key={historyItem.id}>
																	<SidebarMenuSubButton asChild>
																		<a href={historyItem.url}>
																			<span className="truncate">{historyItem.title}</span>
																		</a>
																	</SidebarMenuSubButton>
																</SidebarMenuSubItem>
															))}

															{/* Nút Xem Thêm API */}
															{hasMoreHistory && (
																<SidebarMenuSubItem>
																	<SidebarMenuSubButton
																		onClick={(e) => {
																			if (isLoadingHistory) {
																				e.preventDefault();
																				return;
																			}
																			fetchMoreHistory();
																		}}
																		className={`mt-1 text-muted-foreground ${
																			isLoadingHistory
																				? "opacity-50 pointer-events-none"
																				: "hover:text-primary cursor-pointer"
																		}`}
																	>
																		{isLoadingHistory ? (
																			<Loader2 className="size-4 animate-spin" />
																		) : (
																			<MoreHorizontal className="size-4" />
																		)}
																		<span>{isLoadingHistory ? "Đang tải..." : "Xem thêm"}</span>
																	</SidebarMenuSubButton>
																</SidebarMenuSubItem>
															)}
														</>
													) : (
														<SidebarMenuSubItem>
															<SidebarMenuSubButton className="opacity-50 pointer-events-none">
																<span className="text-muted-foreground italic">Chưa có lịch sử tra cứu</span>
															</SidebarMenuSubButton>
														</SidebarMenuSubItem>
													)}
												</SidebarMenuSub>
											</CollapsibleContent>
										</SidebarMenuItem>
									</Collapsible>
								);
							}

							// TRƯỜNG HỢP 2: CÁC MỤC BÌNH THƯỜNG
							return (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton asChild tooltip={item.title}>
										<a href={item.url}>
											{item.icon && <item.icon />}
											<span>{item.title}</span>
										</a>
									</SidebarMenuButton>
								</SidebarMenuItem>
							);
						})}
					</SidebarMenu>
				</SidebarGroup>

				{/* --- CẤU HÌNH HỆ THỐNG CỐ ĐỊNH Ở ĐÁY --- */}
				<SidebarGroup className="mt-auto">
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton asChild>
								<Link href="#">
									<Settings />
									<span>Cấu hình hệ thống</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarGroup>
			</SidebarContent>

			{/* --- F O O T E R (Đăng nhập) --- */}
			<SidebarFooter>
				<SidebarMenu>
					{user ? (
						<SidebarMenuItem>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<SidebarMenuButton
										size="lg"
										className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
									>
										<img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-lg" />
										<div className="grid flex-1 text-left text-sm leading-tight">
											<span className="truncate font-semibold">{user.name}</span>
											<span className="truncate text-xs">{user.email}</span>
										</div>
										<ChevronsUpDown className="ml-auto size-4" />
									</SidebarMenuButton>
								</DropdownMenuTrigger>
								<DropdownMenuContent className="w-[--radix-popper-anchor-width] side=top">
									<DropdownMenuItem>Hồ sơ cá nhân</DropdownMenuItem>
									<DropdownMenuItem onClick={logout}>Đăng xuất</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</SidebarMenuItem>
					) : (
						<SidebarMenuItem>
							<SidebarMenuButton
								size="lg"
								className="bg-primary/10 text-primary hover:bg-primary/20 font-medium"
								onClick={() => login({ name: "Bảo Trân", email: "tran.le@hcmut.edu.vn", avatar: "https://github.com/shadcn.png" })}
							>
								<LogIn className="size-4" />
								<span>Đăng nhập hệ thống</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					)}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
