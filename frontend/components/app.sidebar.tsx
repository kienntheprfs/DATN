"use client";

import { useEffect, useState } from "react";
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
    MoreHorizontal,
    LogIn,
    GraduationCap,
    User,
    LogOut,
    ChevronDown,
    Pencil,
    Trash2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAppStore } from "@/stores/app.store";
import { toast } from "sonner";

// ─── Navigation items cho người dùng ───
const userNavItems = [
    {
        title: "Hội thoại mới",
        url: "/",
        icon: "chat_bubble",
        isActive: true,
    },
    {
        title: "Lịch sử tra cứu",
        icon: "history",
        isActive: true,
        isDynamicHistory: true,
        requiresAuth: true,
    },
    {
        title: "Chi tiết lịch sử",
        url: "/history",
        icon: "bookmark",
        isActive: true,
        requiresAuth: true,
    },
    {
        title: "Chỉ đường",
        url: "/navigation",
        icon: "navigation",
        isActive: true,
    },
];

// ─── Navigation items dành riêng cho admin ───
const adminNavItems = [
    {
        title: "Cơ sở tri thức",
        url: "/admin/knowledge",
        icon: "archive",
        isActive: true,
    },
    {
        title: "Phân tích Chủ đề",
        url: "/admin/topic",
        icon: "analytics",
        isActive: true,
    },
    {
        title: "Dữ liệu bản đồ thiếu",
        url: "/admin/missing-in-map",
        icon: "conversion_path",
        isActive: true,
    },
    {
        title: "Quản lý Bài ghim",
        url: "/admin/pinned-post",
        icon: "push_pin",
        isActive: true,
    },
    {
        title: "Đánh giá người dùng",
        url: "/admin/rating",
        icon: "rate_review",
        isActive: true,
    },
    {
        title: "Câu hỏi thường gặp",
        url: "/faq",
        icon: "help",
        isActive: true,
    },
    {
        title: "Quản lý bản đồ",
        url: "/navigation/editor",
        icon: "map",
        isActive: true,
    },
    {
        title: "Cài đặt API",
        url: "#",
        icon: "settings",
        isActive: true,
    },
];

/** Check xem user có role admin không */
function isAdminUser(user: { roles?: Array<{ id: string; name: string }>; is_superuser?: boolean } | null): boolean {
    if (!user) return false;
    return user.is_superuser || user.roles?.some((r) => r.name === "admin") || false;
}

/** Check if a URL is currently active */
function isRouteActive(pathname: string, url: string): boolean {
    if (url === "/" || url === "#") return pathname === url;
    return pathname.startsWith(url);
}

export function AppSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, history, isLoadingHistory, hasMoreHistory, login, fetchMoreHistory, refreshHistory, deleteHistoryItem, updateHistoryItemTitle, logout } = useAppStore();
    const [renamingItem, setRenamingItem] = useState<{ id: string; title: string } | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);
    // True until the first login() resolves — used to show shimmer for ALL nav items at once
    const [isInitializing, setIsInitializing] = useState(true);

    const isAdmin = isAdminUser(user);

    // Refresh history on navigation, but NOT during initial load (init handles that separately)
    useEffect(() => {
        if (!isInitializing && user) {
            refreshHistory();
        }
    }, [pathname]);

    // Single init effect: login() then mark done
    useEffect(() => {
        login().finally(() => setIsInitializing(false));
    }, []);

    // After init: load history for the first time if not yet loaded
    useEffect(() => {
        if (user && history.length === 0 && hasMoreHistory && !isLoadingHistory) {
            fetchMoreHistory();
        }
    }, [user, history.length, hasMoreHistory, isLoadingHistory, fetchMoreHistory]);

    const handleLogout = async () => {
        await logout();
        router.push("/auth");
    };

    const handleRename = (item: { id: string; title: string }) => {
        setRenamingItem(item);
        setNewTitle(item.title);
    };

    const handleSaveRename = async () => {
        if (!renamingItem || !newTitle.trim()) return;
        try {
            await updateHistoryItemTitle(renamingItem.id, newTitle.trim());
            toast.success("Đã cập nhật tiêu đề");
            setRenamingItem(null);
        } catch {
            toast.error("Không thể cập nhật tiêu đề");
        }
    };

    const handleDelete = async (itemId: string) => {
        setDeletingId(itemId);
        try {
            await deleteHistoryItem(itemId);
            toast.success("Đã xóa hội thoại");
        } catch {
            toast.error("Không thể xóa hội thoại");
        } finally {
            setDeletingId(null);
        }
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

    // ─── Helper: render a single nav link item (admin-style) ───
    const renderNavLink = (item: { title: string; url: string; icon: string }, active: boolean) => (
        <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
                asChild
                tooltip={item.title}
                className={`h-auto! px-3 py-2 gap-3 rounded-md transition-colors ${
                    active
                        ? "bg-primary! text-white! shadow-sm hover:bg-primary! hover:text-white!"
                        : "bg-transparent! text-blue-200 hover:text-white! hover:bg-white/5!"
                }`}
            >
                <Link href={item.url}>
                    <span className={`material-symbols-outlined text-[20px] ${active ? "fill-1" : ""}`}>{item.icon}</span>
                    <span className="text-sm font-medium">{item.title}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    );

    return (
        <Sidebar className="bg-primary-dark text-white border-r border-slate-800">
            {/* ─── Header (h-16 matching admin sidebar) ─── */}
            <SidebarHeader className="h-16 flex-row items-center justify-between px-4 border-b border-white/10 p-0">
                <Link href="/" className="flex items-center gap-3 ml-4">
                    <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                        <span className="material-symbols-outlined text-white text-[20px]">school</span>
                    </div>
                    <div>
                        <h1 className="font-heading font-semibold text-[14px] leading-tight text-white mb-0">Academic Nexus</h1>
                        <p className="text-xs text-blue-200 font-display mt-0">Hệ thống Tra cứu</p>
                    </div>
                </Link>
            </SidebarHeader>

            {/* ─── Content ─── */}
            <SidebarContent>
                <SidebarGroup className="py-6 px-2">
                    <SidebarMenu className="gap-1">
                        {/* ─── Shimmer during initial auth check ─── */}
                        {isInitializing ? (
                            // Show placeholders for all expected slots so nothing pops in late
                            [60, 75, 55, 65].map((w, i) => (
                                <SidebarMenuItem key={i}>
                                    <div className="flex items-center gap-3 px-3 py-2">
                                        <div className="w-5 h-5 rounded bg-white/20 animate-pulse shrink-0" />
                                        <div
                                            className="h-3.5 bg-white/20 rounded animate-pulse"
                                            style={{ width: `${w}%` }}
                                        />
                                    </div>
                                </SidebarMenuItem>
                            ))
                        ) : (
                            <>
                                {/* ─── User navigation items ─── */}
                                {userNavItems.map((item) => {
                                    // Dynamic history collapsible
                                    if (item.isDynamicHistory) {
                                        if (!user) return null;
                                        return (
                                            <Collapsible key={item.title} defaultOpen={item.isActive} className="group/collapsible">
                                                <SidebarMenuItem>
                                                    <CollapsibleTrigger asChild>
                                                        <SidebarMenuButton
                                                            tooltip={item.title}
                                                            className="h-auto! px-3 py-2 gap-3 rounded-xl transition-colors bg-transparent! text-blue-200 hover:text-white! hover:bg-white/5! data-[state=open]:bg-white/5! data-[state=open]:text-white!"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                                                            <span className="text-sm font-medium">{item.title}</span>
                                                            <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                                                        </SidebarMenuButton>
                                                    </CollapsibleTrigger>

                                                    <CollapsibleContent>
                                                        <SidebarMenuSub className="max-h-64 overflow-y-auto border-blue-300/20">
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
                                                                            <div className="flex items-center gap-1 group">
                                                                                <SidebarMenuSubButton asChild className="text-blue-200/80 hover:text-white hover:bg-white/5 flex-1 min-w-0">
                                                                                    <Link href={historyItem.url}>
                                                                                        <span className="truncate">{historyItem.title}</span>
                                                                                    </Link>
                                                                                </SidebarMenuSubButton>
                                                                                <DropdownMenu>
                                                                                    <DropdownMenuTrigger asChild>
                                                                                        <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded transition-opacity">
                                                                                            <MoreHorizontal className="size-4 text-blue-200/60" />
                                                                                        </button>
                                                                                    </DropdownMenuTrigger>
                                                                                    <DropdownMenuContent align="end">
                                                                                        <DropdownMenuItem onClick={() => handleRename(historyItem)}>
                                                                                            <Pencil className="size-4 mr-2" />
                                                                                            Đổi tên
                                                                                        </DropdownMenuItem>
                                                                                        <DropdownMenuSeparator />
                                                                                        <DropdownMenuItem
                                                                                            onClick={() => handleDelete(historyItem.id)}
                                                                                            className="text-destructive focus:text-destructive"
                                                                                            disabled={deletingId === historyItem.id}
                                                                                        >
                                                                                            <Trash2 className="size-4 mr-2" />
                                                                                            {deletingId === historyItem.id ? "Đang xóa..." : "Xóa"}
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>
                                                                            </div>
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
                                                                                className="text-blue-200/60 hover:bg-white/5 hover:text-white cursor-pointer"
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
                                                                    <SidebarMenuSubButton className="opacity-50 pointer-events-none text-blue-200/60">
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

                                    // Items requiring auth
                                    if (item.requiresAuth && !user) return null;

                                    const active = isRouteActive(pathname, item.url!);
                                    return renderNavLink(item as { title: string; url: string; icon: string }, active);
                                }).filter(Boolean)}

                                {/* ─── Admin section (chỉ hiện khi user có role admin) ─── */}
                                {isAdmin && (
                                    <>
                                        <div className="pt-4 pb-2">
                                            <div className="px-3 text-[11px] font-bold text-blue-300/60 uppercase tracking-wider font-heading">Quản trị</div>
                                        </div>
                                        {adminNavItems.map((item) => {
                                            const active = isRouteActive(pathname, item.url);
                                            return renderNavLink(item, active);
                                        })}
                                    </>
                                )}
                            </>
                        )}
                    </SidebarMenu>
                </SidebarGroup>
            </SidebarContent>

            {/* ─── Footer ─── */}
            <SidebarFooter className="p-4 border-t border-white/10">
                {isInitializing ? (
                    // Footer shimmer during init
                    <div className="flex items-center gap-3 px-0 py-1 animate-pulse">
                        <div className="w-8 h-8 rounded-full bg-white/20 shrink-0" />
                        <div className="flex flex-col gap-1.5 flex-1">
                            <div className="h-3 bg-white/20 rounded w-3/4" />
                            <div className="h-2.5 bg-white/20 rounded w-1/2" />
                        </div>
                    </div>
                ) : user ? (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="flex items-center gap-3 w-full px-3 py-2.5 hover:bg-white/5 transition-colors text-left rounded-md">
                                {user.avatar_url ? (
                                    <img
                                        src={user.avatar_url}
                                        alt=""
                                        className="h-8 w-8 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold text-white font-mono">
                                        {getInitials(user.display_name, user.email)}
                                    </div>
                                )}
                                <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
                                    <span className="text-sm font-medium text-white truncate">
                                        {user.display_name || "Người dùng"}
                                    </span>
                                    <span className="text-xs text-blue-200 truncate">{user.email}</span>
                                </div>
                                <ChevronDown className="size-4 text-blue-200/60" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="start" className="w-56">
                            <DropdownMenuItem asChild>
                                <Link href="/profile" className="cursor-pointer">
                                    <User className="mr-2 size-4" />
                                    Hồ sơ cá nhân
                                </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
                                <LogOut className="mr-2 size-4" />
                                Đăng xuất
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Link
                        href="/auth"
                        className="flex items-center justify-center gap-2 mx-3 py-2.5 bg-white/10 hover:bg-white/15 rounded-md transition-colors font-medium text-blue-200 hover:text-white"
                    >
                        <LogIn className="size-4" />
                        <span>Đăng nhập</span>
                    </Link>
                )}
            </SidebarFooter>

            {/* ─── Rename dialog ─── */}
            <Dialog open={!!renamingItem} onOpenChange={(open) => !open && setRenamingItem(null)}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Đổi tên hội thoại</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Input
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Nhập tiêu đề mới"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveRename();
                            }}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRenamingItem(null)}>
                            Hủy
                        </Button>
                        <Button onClick={handleSaveRename}>
                            Lưu
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Sidebar>
    );
}
