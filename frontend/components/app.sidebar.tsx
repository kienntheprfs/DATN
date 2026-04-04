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
    LogOut,
    ChevronDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/stores/app.store";
import { authService } from "@/services/auth-api";

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
            icon: History,
            isActive: true,
            isDynamicHistory: true,
            requiresAuth: true,
        },
        {
            title: "Chi tiết lịch sử",
            url: "/history",
            icon: Bookmark,
            isActive: true,
            requiresAuth: true,
        },
    ],
};

export function AppSidebar() {
    const router = useRouter();
    const { user, history, isLoadingHistory, hasMoreHistory, login, fetchMoreHistory } = useAppStore();

    useEffect(() => {
        login();
    }, []);

    useEffect(() => {
        if (user && history.length === 0 && hasMoreHistory && !isLoadingHistory) {
            fetchMoreHistory();
        }
    }, [user, history.length, hasMoreHistory, isLoadingHistory, fetchMoreHistory]);

    const handleLogout = async () => {
        await authService.logout();
        router.push("/auth");
    };

    const getInitials = (name: string | undefined, email: string) => {
        if (name) {
            return name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);
        }
        return email[0]?.toUpperCase() || "U";
    };

    return (
        <Sidebar className="bg-primary text-primary-foreground">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <Link href="/" className="flex items-center gap-3 px-3 py-2 hover:bg-white/10 rounded-lg transition-colors">
                            <div className="flex aspect-square size-10 items-center justify-center rounded-lg bg-white/20">
                                <GraduationCap className="size-6 fill-current" />
                            </div>
                            <div className="grid leading-tight">
                                <span className="font-semibold text-base">BK-TBOT</span>
                                <span className="text-xs text-white/60">HCMUT</span>
                            </div>
                        </Link>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarMenu>
                        {data.navMain.map((item) => {
                            if (item.isDynamicHistory) {
                                if (!user) return null;
                                return (
                                    <Collapsible key={item.title} defaultOpen={item.isActive} className="group/collapsible">
                                        <SidebarMenuItem>
                                            <CollapsibleTrigger asChild>
                                                <SidebarMenuButton 
                                                    tooltip={item.title}
                                                    className="hover:bg-white/15 hover:text-white data-[state=open]:bg-white/15 data-[state=open]:text-white"
                                                >
                                                    {item.icon && <item.icon />}
                                                    <span>{item.title}</span>
                                                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                </SidebarMenuButton>
                                            </CollapsibleTrigger>

                                            <CollapsibleContent>
                                                <SidebarMenuSub className="max-h-64 overflow-y-auto">
                                                    {isLoadingHistory && history.length === 0 ? (
                                                        <>
                                                            {[1, 2, 3, 4, 5].map((i) => (
                                                                <SidebarMenuSubItem key={i}>
                                                                    <SidebarMenuSubButton className="pointer-events-none">
                                                                        <Skeleton className="h-4 w-32 bg-white/20" />
                                                                    </SidebarMenuSubButton>
                                                                </SidebarMenuSubItem>
                                                            ))}
                                                        </>
                                                    ) : history.length > 0 ? (
                                                        <>
                                                            {history.map((historyItem, index) => (
                                                                <SidebarMenuSubItem key={`${historyItem.id}-${index}`}>
                                                                    <SidebarMenuSubButton asChild className="hover:bg-white/15 text-white/80 hover:text-white">
                                                                        <Link href={historyItem.url}>
                                                                            <span className="truncate">{historyItem.title}</span>
                                                                        </Link>
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
                                                                        className="text-white/60 hover:bg-white/15 hover:text-white cursor-pointer"
                                                                    >
                                                                        <MoreHorizontal className="size-4" />
                                                                        <span>Xem thêm</span>
                                                                    </SidebarMenuSubButton>
                                                                </SidebarMenuSubItem>
                                                            )}
                                                            {isLoadingHistory && (
                                                                <>
                                                                    {[1, 2].map((i) => (
                                                                        <SidebarMenuSubItem key={`loading-${i}`}>
                                                                            <SidebarMenuSubButton className="pointer-events-none">
                                                                                <Skeleton className="h-4 w-24 bg-white/20" />
                                                                            </SidebarMenuSubButton>
                                                                        </SidebarMenuSubItem>
                                                                    ))}
                                                                </>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton className="opacity-50 pointer-events-none text-white/60">
                                                                <span>Chưa có lịch sử</span>
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    )}
                                                </SidebarMenuSub>
                                            </CollapsibleContent>
                                        </SidebarMenuItem>
                                    </Collapsible>
                                );
                            }

                            if (item.requiresAuth && !user) {
                                return null;
                            }

                            return (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton 
                                        asChild 
                                        tooltip={item.title}
                                        className="hover:bg-white/15 hover:text-white"
                                    >
                                        <a href={item.url}>
                                            {item.icon && <item.icon />}
                                            <span>{item.title}</span>
                                        </a>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            );
                        }).filter(Boolean)}
                    </SidebarMenu>
                </SidebarGroup>

                <SidebarGroup className="mt-auto">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton asChild tooltip="Cấu hình" className="hover:bg-white/15 hover:text-white">
                                <Link href="#">
                                    <Settings />
                                    <span>Cấu hình</span>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                {user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/10 transition-colors text-left">
                                {user.avatar_url ? (
                                    <img 
                                        src={user.avatar_url} 
                                        alt="" 
                                        className="h-9 w-9 rounded-full object-cover" 
                                    />
                                ) : (
                                    <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center font-medium">
                                        {getInitials(user.display_name, user.email)}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">
                                        {user.display_name || "Người dùng"}
                                    </p>
                                </div>
                                <ChevronDown className="size-4 opacity-60" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" className="w-56">
                            <DropdownMenuItem asChild>
                                <Link href="/profile" className="cursor-pointer">
                                    <User className="mr-2 size-4" />
                                    Hồ sơ cá nhân
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                                <LogOut className="mr-2 size-4" />
                                Đăng xuất
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link 
                        href="/auth" 
                        className="flex items-center justify-center gap-2 mx-3 py-2.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors font-medium"
                    >
                        <LogIn className="size-4" />
                        <span>Đăng nhập</span>
                    </Link>
                )}
            </SidebarFooter>
        </Sidebar>
    );
}
