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
    MessageSquare,
    ScrollText,
    History,
    Bookmark,
    Settings,
    MoreHorizontal,
    LogIn,
    GraduationCap,
    User,
    LogOut,
    ChevronDown,
    Pencil,
    Trash2,
    Shield,
    HelpCircle,
    Navigation,
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

const data = {
    navMain: [
        {
            title: "Hội thoại mới",
            url: "/",
            icon: MessageSquare,
            isActive: true,
        },
        // {
        //     title: "Kho văn bản",
        //     url: "#",
        //     icon: ScrollText,
        //     isActive: true,
        // },
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
        {
            title: "Câu hỏi thường gặp",
            url: "/faq",
            icon: HelpCircle,
            isActive: true,
            requiresAuth: true,
            requiresAdmin: true,
        },
        {
            title: "Chỉ đường",
            url: "/navigation",
            icon: Navigation,
            isActive: true,
        },
        {
            title: "Quản lý bản đồ",
            url: "/navigation/editor",
            icon: Shield,
            isActive: true,
            requiresAuth: true,
            requiresAdmin: true,
        },
        // {
        //     title: "Lịch sử Admin",
        //     url: "/admin/audit",
        //     icon: Shield,
        //     isActive: true,
        //     requiresAuth: true,
        //     requiresAdmin: true,
        // },
    ],
};

export function AppSidebar() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, history, isLoadingHistory, hasMoreHistory, login, fetchMoreHistory, refreshHistory, deleteHistoryItem, updateHistoryItemTitle, logout } = useAppStore();
    const [renamingItem, setRenamingItem] = useState<{ id: string; title: string } | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        if (user) {
            refreshHistory();
        }
    }, [pathname]);

    useEffect(() => {
        login();
    }, []);

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
                                                                    <div className="flex items-center gap-1 group">
                                                                        <SidebarMenuSubButton asChild className="hover:bg-white/15 text-white/80 hover:text-white flex-1 min-w-0">
                                                                            <Link href={historyItem.url}>
                                                                                <span className="truncate">{historyItem.title}</span>
                                                                            </Link>
                                                                        </SidebarMenuSubButton>
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded transition-opacity">
                                                                                    <MoreHorizontal className="size-4 text-white/60" />
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

                            if (item.requiresAdmin && user) {
                                const isAdmin = user.roles?.some((r) => r.name === "admin") || user.is_superuser;
                                if (!isAdmin) return null;
                            }

                            return (
                                <SidebarMenuItem key={item.title}>
                                    <SidebarMenuButton 
                                        asChild 
                                        tooltip={item.title}
                                        className="hover:bg-white/15 hover:text-white"
                                    >
                                        <Link href={item.url}>
                                            {item.icon && <item.icon />}
                                            <span>{item.title}</span>
                                        </Link>
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
