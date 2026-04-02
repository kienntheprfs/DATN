"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SortDesc, Download, Trash2, ExternalLink } from "lucide-react";
import { useAppStore } from "@/stores/app.store";
import type { HistoryItem } from "@/types/history";

type SortOption = "newest" | "oldest" | "az";

export default function HistoryPage() {
  const router = useRouter();
  const { history, isLoadingHistory, hasMoreHistory, fetchMoreHistory } = useAppStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filteredHistory, setFilteredHistory] = useState<HistoryItem[]>([]);

  useEffect(() => {
    if (history.length === 0 && hasMoreHistory && !isLoadingHistory) {
      fetchMoreHistory();
    }
  }, [history, hasMoreHistory, isLoadingHistory, fetchMoreHistory]);

  useEffect(() => {
    let filtered = history.filter((item) =>
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
  }, [history, searchQuery, sortBy]);

  const handleReopen = (item: HistoryItem) => {
    router.push(`/chat?message=${encodeURIComponent(item.title)}`);
  };

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
              <input
                type="text"
                placeholder="Tìm kiếm theo tiêu đề hoặc nội dung hội thoại..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-border rounded-md text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary font-sans bg-background"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <div className="relative group">
              <button className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-foreground rounded-md shadow-sm hover:bg-accent transition-colors text-sm font-medium">
                <SortDesc className="h-4 w-4" />
                Sắp xếp
              </button>
              <div className="absolute right-0 mt-1 w-48 bg-background border border-border shadow-lg rounded-md py-1 hidden group-hover:block z-50">
                <button
                  onClick={() => setSortBy("newest")}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-accent ${
                    sortBy === "newest" ? "bg-accent font-medium" : ""
                  }`}
                >
                  Mới nhất
                </button>
                <button
                  onClick={() => setSortBy("oldest")}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-accent ${
                    sortBy === "oldest" ? "bg-accent font-medium" : ""
                  }`}
                >
                  Cũ nhất
                </button>
                <button
                  onClick={() => setSortBy("az")}
                  className={`block w-full text-left px-4 py-2 text-sm hover:bg-accent ${
                    sortBy === "az" ? "bg-accent font-medium" : ""
                  }`}
                >
                  Theo tiêu đề A-Z
                </button>
              </div>
            </div>
            <button className="flex items-center gap-2 px-4 py-2 bg-background border border-border text-foreground rounded-md shadow-sm hover:bg-accent transition-colors text-sm font-medium">
              <Download className="h-4 w-4" />
              Export Logs
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 text-red-600 rounded-md shadow-sm hover:bg-red-100 transition-colors text-sm font-medium">
              <Trash2 className="h-4 w-4" />
              Clear History
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {isLoadingHistory && history.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredHistory.length > 0 ? (
            filteredHistory.map((item) => (
              <div
                key={item.id}
                className="flex flex-col bg-slate-50 border border-border rounded-lg p-5 hover:border-primary/40 transition-colors"
              >
                <div className="flex justify-between items-start gap-4 mb-3">
                  <h3 className="font-heading font-semibold text-lg text-foreground">
                    {item.title}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground whitespace-nowrap bg-background px-2 py-1 border border-border rounded">
                    {item.timestamp}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2 mb-4 leading-relaxed">
                  {item.preview}
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => handleReopen(item)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors text-sm font-medium shadow-sm"
                  >
                    Re-open
                    <ExternalLink className="h-4 w-4" />
                  </button>
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
              <button
                onClick={fetchMoreHistory}
                className="flex items-center gap-2 px-6 py-2 bg-background border border-border text-foreground rounded-md hover:bg-accent transition-colors text-sm font-medium"
              >
                Xem thêm
              </button>
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
