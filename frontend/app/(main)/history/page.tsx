"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, SortDesc, Pencil, Trash2, MoreVertical, Check, X, ExternalLink, RefreshCw } from "lucide-react";
import { useAppStore } from "@/stores/app.store";
import { authService } from "@/services/auth-api";
import type { HistoryItem } from "@/types/history";
import { formatTimeAgo } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type SortOption = "newest" | "oldest" | "az";

export default function HistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, history, isLoadingHistory, isErrorHistory, hasMoreHistory, fetchMoreHistory, clearAllHistory, refreshHistory, deleteHistoryItem, updateHistoryItemTitle } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filteredHistory, setFilteredHistory] = useState<Array<HistoryItem & { displayTimestamp?: string }>>([]);
  const [tick, setTick] = useState(0);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        await authService.me();
      } catch {
        router.push("/auth?redirected=true");
        return;
      }
      setIsCheckingAuth(false);
    };
    checkAuth();
  }, [router]);

  useEffect(() => {
    if (!isCheckingAuth && !isErrorHistory) {
      refreshHistory();
    }
  }, [isCheckingAuth, isErrorHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const historyWithRecalculatedTime = useMemo(() => {
    return history.map((item) => ({
      ...item,
      displayTimestamp: item.updatedAt ? formatTimeAgo(item.updatedAt) : item.timestamp,
    }));
  }, [history, tick]);

  useEffect(() => {
    let filtered = historyWithRecalculatedTime.filter((item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    switch (sortBy) {
      case "oldest":
        filtered = [...filtered].reverse();
        break;
      case "az":
        filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "newest":
      default:
        break;
    }

    setFilteredHistory(filtered);
  }, [historyWithRecalculatedTime, searchQuery, sortBy]);

  const handleReopen = (item: HistoryItem) => {
    router.push(`/chat?thread_id=${item.id}`);
  };

  const handleStartEdit = (item: HistoryItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTitle("");
  };

  const handleSaveEdit = async (item: HistoryItem) => {
    if (!editingTitle.trim()) {
      toast.error("Tiêu đề không được để trống");
      return;
    }
    try {
      await updateHistoryItemTitle(item.id, editingTitle.trim());
      toast.success("Đã cập nhật tiêu đề");
      setEditingId(null);
    } catch {
      toast.error("Không thể cập nhật tiêu đề. Vui lòng thử lại.");
    }
  };

  const handleDelete = async (item: HistoryItem) => {
    setDeletingId(item.id);
    try {
      await deleteHistoryItem(item.id);
      toast.success("Đã xóa hội thoại");
    } catch {
      toast.error("Không thể xóa hội thoại. Vui lòng thử lại.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      await clearAllHistory();
      toast.success("Đã xóa toàn bộ lịch sử hội thoại");
    } catch {
      toast.error("Không thể xóa lịch sử. Vui lòng thử lại.");
    } finally {
      setIsDeletingAll(false);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto w-full p-6 lg:p-10">
      <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-4 border-b border-border">
          <div className="w-full sm:w-auto flex-1">
            <h1 className="text-2xl font-heading font-semibold text-primary mb-1">
              Lịch sử tra cứu
            </h1>
            <p className="text-sm text-muted-foreground mb-4">
              Xem lại các truy vấn và phiên hỏi đáp trước đây của bạn.
            </p>
            <div className="relative w-full max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground" />
              </div>
              <Input
                type="text"
                placeholder="Tìm kiếm theo tiêu đề hoặc nội dung hội thoại..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <SortDesc className="h-4 w-4 mr-2" />
                  Sắp xếp
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem 
                  onClick={() => setSortBy("newest")}
                  className={sortBy === "newest" ? "bg-accent font-medium" : ""}
                >
                  Mới nhất
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSortBy("oldest")}
                  className={sortBy === "oldest" ? "bg-accent font-medium" : ""}
                >
                  Cũ nhất
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => setSortBy("az")}
                  className={sortBy === "az" ? "bg-accent font-medium" : ""}
                >
                  Theo tiêu đề A-Z
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={history.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Xóa tất cả
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xóa toàn bộ lịch sử?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Hành động này sẽ xóa vĩnh viễn tất cả {history.length} cuộc hội thoại của bạn. 
                    Bạn không thể hoàn tác điều này.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Hủy</AlertDialogCancel>
                  <AlertDialogAction 
                    onClick={handleDeleteAll}
                    disabled={isDeletingAll}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeletingAll ? "Đang xóa..." : "Xóa tất cả"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {isLoadingHistory && history.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : isErrorHistory ? (
            <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-red-200 rounded-lg bg-red-50/30 p-6">
              <RefreshCw className="h-10 w-10 text-red-500/80 mb-3 animate-pulse" />
              <p className="text-red-700 font-semibold mb-1">Không thể tải lịch sử tra cứu</p>
              <p className="text-xs text-muted-foreground mb-4 max-w-sm">
                Đã thử tải tự động 5 lần nhưng kết nối thất bại. Vui lòng bấm nút tải lại để thử lại thủ công.
              </p>
              <Button onClick={() => refreshHistory()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </Button>
            </div>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex items-center gap-4 bg-slate-50 border border-border rounded-lg px-4 py-3 group"
              >
                <div className="flex-1 min-w-0">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="h-8 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit(item);
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                      <Button size="sm" variant="ghost" onClick={() => handleSaveEdit(item)} className="h-8 w-8 p-0">
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-8 w-8 p-0">
                        <X className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  ) : (
                    <h3 className="font-heading font-medium text-foreground truncate">
                      {item.title}
                    </h3>
                  )}
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {item.displayTimestamp}
                </span>
                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                  <Button onClick={() => handleReopen(item)} size="sm" className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
                    Re-open
                    <ExternalLink className="h-4 w-4 ml-1" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleStartEdit(item)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Đổi tên
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(item)} 
                        className="text-destructive focus:text-destructive"
                        disabled={deletingId === item.id}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deletingId === item.id ? "Đang xóa..." : "Xóa"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <p>Không có lịch sử tra cứu nào</p>
            </div>
          )}

          {hasMoreHistory && !isLoadingHistory && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={fetchMoreHistory}>
                Xem thêm
              </Button>
            </div>
          )}

          {isLoadingHistory && history.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
