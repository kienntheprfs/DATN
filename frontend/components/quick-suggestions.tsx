"use client";

import React, { useState, useEffect } from "react";
import { Calendar, Lightbulb, BookOpen, Sparkles, FileText, GraduationCap, ChevronDown, ChevronUp, ArrowUpRight } from "lucide-react";
import { pinnedPostService, PinnedPostItemResponse } from "@/services/pinned-post-api";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const getCategoryConfig = (category: string) => {
  switch (category) {
    case "Quy chế Đào tạo":
      return {
        icon: BookOpen,
        colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/30",
      };
    case "Sau Đại học":
      return {
        icon: GraduationCap,
        colorClass: "text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/30",
      };
    case "Công tác Sinh viên":
      return {
        icon: Calendar,
        colorClass: "text-orange-500 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/30",
      };
    case "Nghiên cứu Khoa học":
      return {
        icon: FileText,
        colorClass: "text-cyan-400 bg-slate-50 dark:bg-slate-950/30 border-slate-200 dark:border-slate-800/30",
      };
    default:
      return {
        icon: Sparkles,
        colorClass: "text-purple-500 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800/30",
      };
  }
};

export default function QuickSuggestions() {
  const [posts, setPosts] = useState<PinnedPostItemResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    pinnedPostService
      .listPublic({ limit: 30, sort_by: "manual" })
      .then((res) => {
        setPosts(res.items || []);
      })
      .catch((err) => {
        console.error("Lỗi khi tải bài ghim ở trang chủ:", err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  if (isLoading) {
    return (
      <div className="w-full flex flex-wrap gap-2.5 my-4">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-9 w-48 rounded-full" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-full flex flex-col">
        <div className="flex items-center px-1">
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-xs font-bold uppercase tracking-wider text-foreground/80 hover:text-primary transition-all duration-200 flex items-center gap-1.5 cursor-pointer select-none py-1 group rounded-md hover:bg-muted/40 px-2 -ml-2"
          >
            <Sparkles className="size-3 text-primary group-hover:scale-110 transition-transform" />
            <span>Bài ghim phổ biến</span>
            {isCollapsed ? (
              <ChevronDown className="size-3.5 text-foreground/60 group-hover:text-primary transition-colors" />
            ) : (
              <ChevronUp className="size-3.5 text-foreground/60 group-hover:text-primary transition-colors" />
            )}
          </button>
        </div>

        <div
          className={`flex flex-wrap gap-2.5 transition-all duration-300 ease-in-out overflow-hidden ${
            isCollapsed ? "max-h-0 opacity-0 pointer-events-none mt-0" : "max-h-[500px] opacity-100 mt-3"
          }`}
        >
          {posts.map((item) => {
            const config = getCategoryConfig(item.category);
            const Icon = config.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <a
                    href={item.source_url || "/pinned-post"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-full hover:bg-accent/40 hover:border-primary/30 transition-all duration-200 text-sm font-medium text-foreground cursor-pointer select-none whitespace-nowrap shadow-sm hover:shadow active:scale-[0.98] group animate-fade-in"
                  >
                    <span className={`p-1 rounded-full ${config.colorClass} group-hover:scale-110 transition-transform`}>
                      <Icon className="size-3.5" />
                    </span>
                    <span>{item.title}</span>
                    <ArrowUpRight className="size-3 text-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                </TooltipTrigger>
                <TooltipContent className="p-3 max-w-sm flex flex-col gap-1.5 shadow-xl border border-border bg-popover text-popover-foreground z-[100] rounded-lg">
                  <div className="flex items-center justify-between gap-4">
                    <span className={`text-[10px] font-bold px-2 py-0.5 border uppercase rounded inline-flex ${config.colorClass}`}>
                      {item.category}
                    </span>
                    {item.document_type && (
                      <span className="text-[10px] text-foreground/75 uppercase bg-muted px-1.5 py-0.5 rounded">
                        {item.document_type}
                      </span>
                    )}
                  </div>
                  <h2 className="font-bold text-sm text-foreground mt-1 leading-snug">{item.title}</h2>
                  {item.summary && (
                    <p className="text-sm text-foreground/85 leading-normal mt-0.5 whitespace-normal break-words">
                      {item.summary}
                    </p>
                  )}
                  <div className="text-[11px] text-foreground/70 border-t border-border/60 pt-1.5 mt-1 flex items-center justify-between">
                    <span>Đăng lúc: {new Date(item.pinned_date).toLocaleDateString("vi-VN")}</span>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
