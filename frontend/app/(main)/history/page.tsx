"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Search, SortDesc, ExternalLink } from "lucide-react";
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
import { Trash2 } from "lucide-react";
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
  const { user, history, isLoadingHistory, hasMoreHistory, fetchMoreHistory, clearAllHistory, refreshHistory } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filteredHistory, setFilteredHistory] = useState<Array<HistoryItem & { displayTimestamp?: string }>>([]);
  const [tick, setTick] = useState(0);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

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
    if (!isCheckingAuth) {
      refreshHistory();
    }
  }, [isCheckingAuth]);

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
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((item, index) => (
              <div
                key={`${item.id}-${index}`}
                className="flex flex-col bg-slate-50 border border-border rounded-lg p-5 hover:border-primary/40 transition-colors"
              >
                <div className="flex justify-between items-start gap-4 mb-3">
                  <h3 className="font-heading font-semibold text-lg text-foreground">
                    {item.title}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap bg-background px-2 py-1 border border-border rounded">
                    {item.displayTimestamp}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                  {item.preview}
                </p>
                <div className="flex justify-end">
                  <Button onClick={() => handleReopen(item)} size="sm">
                    Re-open
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
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
