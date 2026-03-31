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
    MessageSquare,
    ScrollText,
    History,
    Bookmark,
    Settings,
    MoreHorizontal,
    LogIn,
    Loader2,
    GraduationCap,
    User,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
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
            isDynamicHistory: true,
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
    const { user, history, isLoadingHistory, hasMoreHistory, login, logout, fetchMoreHistory } = useAppStore();

    useEffect(() => {
        if (history.length === 0 && hasMoreHistory && !isLoadingHistory) {
            fetchMoreHistory();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <Sidebar className="bg-primary text-primary-foreground font-stretch-50%">
            {/* --- H E A D E R --- */}
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                {/* Thêm hover và data-[state=open] cho nút Header */}
                                <SidebarMenuButton 
                                    size="lg" 
                                    className="hover:bg-white/15 hover:text-white data-[state=open]:bg-white/15 data-[state=open]:text-white transition-colors"
                                >
                                    <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-white/20 text-white">
                                        <GraduationCap className="size-6 fill-current" />
                                    </div>

                                    <div className="grid flex-1 text-left leading-tight ml-1">
                                        <span className="truncate font-semibold text-base">BK-TBOT</span>
                                        <span className="truncate text-xs text-primary-foreground/70">HCMUT</span>
                                    </div>

                                    <ChevronsUpDown className="ml-auto size-4 text-primary-foreground/70" />
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
                            // TRƯỜNG HỢP 1: MỤC LỊCH SỬ HOẶC CÓ MENU CON
                            if (item.isDynamicHistory) {
                                return (
                                    <Collapsible key={item.title} defaultOpen={item.isActive} className="group/collapsible">
                                        <SidebarMenuItem>
                                            <CollapsibleTrigger asChild>
                                                {/* Thêm hover và data-[state=open] cho các mục lục chính */}
                                                <SidebarMenuButton 
                                                    tooltip={item.title}
                                                    className="hover:bg-white/15 hover:text-white data-[state=open]:bg-white/15 data-[state=open]:text-white transition-colors"
                                                >
                                                    {item.icon && <item.icon />}
                                                    <span>{item.title}</span>
                                                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                </SidebarMenuButton>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <SidebarMenuSub>
                                                    {isLoadingHistory && history.length === 0 ? (
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton className="opacity-50 pointer-events-none text-primary-foreground/70">
                                                                <Loader2 className="size-4 animate-spin" />
                                                                <span>Đang tải lịch sử...</span>
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    ) : history.length > 0 ? (
                                                        <>
                                                            {history.map((historyItem) => (
                                                                <SidebarMenuSubItem key={historyItem.id}>
                                                                    {/* Thêm hover cho từng dòng lịch sử con */}
                                                                    <SidebarMenuSubButton asChild className="hover:bg-white/15 hover:text-white transition-colors text-primary-foreground/80">
                                                                        <a href={historyItem.url}>
                                                                            <span className="truncate">{historyItem.title}</span>
                                                                        </a>
                                                                    </SidebarMenuSubButton>
                                                                </SidebarMenuSubItem>
                                                            ))}

                                                            {hasMoreHistory && !isLoadingHistory && (
                                                                <SidebarMenuSubItem>
                                                                    <SidebarMenuSubButton
                                                                        onClick={(e) => {
                                                                            if (isLoadingHistory) {
                                                                                e.preventDefault();
                                                                                return;
                                                                            }
                                                                            fetchMoreHistory();
                                                                        }}
                                                                        className="mt-1 transition-colors text-primary-foreground/80 hover:bg-white/15 hover:text-white cursor-pointer"
                                                                    >
                                                                        <MoreHorizontal className="size-4" />
                                                                        <span>Xem thêm</span>
                                                                    </SidebarMenuSubButton>
                                                                </SidebarMenuSubItem>
                                                            )}

                                                            {isLoadingHistory && (
                                                                <>
                                                                    {[1, 2, 3].map((i) => (
                                                                        <SidebarMenuSubItem key={`skeleton-${i}`}>
                                                                            <SidebarMenuSubButton className="pointer-events-none opacity-50">
                                                                                <Skeleton className="h-4 w-full rounded" />
                                                                            </SidebarMenuSubButton>
                                                                        </SidebarMenuSubItem>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton className="opacity-50 pointer-events-none text-primary-foreground/70">
                                                                <span className="italic">Chưa có lịch sử tra cứu</span>
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    )}
                                                </SidebarMenuSub>
                                            </CollapsibleContent>
                                        </SidebarMenuItem>
                                    </Collapsible>
                                );
                            }

                            // TRƯỜNG HỢP 2: CÁC MỤC BÌNH THƯỜNG (Không có menu con)
                            return (
                                <SidebarMenuItem key={item.title}>
                                    {/* Thêm hover cho các mục bấm chuyển trang trực tiếp */}
                                    <SidebarMenuButton 
                                        asChild 
                                        tooltip={item.title}
                                        className="hover:bg-white/15 hover:text-white transition-colors"
                                    >
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
                            {/* Thêm hover cho nút Cấu hình */}
                            <SidebarMenuButton asChild className="hover:bg-white/15 hover:text-white transition-colors">
                                <Link href="/profile">
                                    <User />
                                    <span>Hồ sơ cá nhân</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild className="hover:bg-white/15 hover:text-white transition-colors">
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
                <SidebarMenu className="text-primary-foreground">
                    {user ? (
                        <SidebarMenuItem>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    {/* Thêm hover cho User Profile */}
                                    <SidebarMenuButton
                                        size="lg"
                                        className="hover:bg-white/15 hover:text-white data-[state=open]:bg-white/15 data-[state=open]:text-white transition-colors"
                                    >
                                        <img src={user.avatar} alt={user.name} className="h-8 w-8 rounded-lg" />
                                        <div className="grid flex-1 text-left text-sm leading-tight">
                                            <span className="truncate font-semibold">{user.name}</span>
                                            <span className="truncate text-xs text-primary-foreground/70">{user.email}</span>
                                        </div>
                                        <ChevronsUpDown className="ml-auto size-4 text-primary-foreground/70" />
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
                                className="bg-transparent text-white border border-white/50 hover:bg-white/15 hover:border-white font-medium shadow-none transition-all"
                            >
                                <Link href="/auth" className="flex items-center gap-2">
                                    <LogIn className="size-4" />
                                    <span>Đăng nhập hệ thống</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    )}
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}