"use client";

import React, { useState, useEffect, useRef } from "react";
import { Calendar, Lightbulb, BookOpen, Sparkles, FileText, GraduationCap, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
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
  
  // Slide buttons have three states: 
  // "active" (clickable, visible), "disabled" (unclickable for 500ms safety), "hidden" (invisible, click-through allowed)
  const [leftState, setLeftState] = useState<"active" | "disabled" | "hidden">("hidden");
  const [rightState, setRightState] = useState<"active" | "disabled" | "hidden">("active");

  const leftTimerRef = useRef<NodeJS.Timeout | null>(null);
  const rightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const offset = direction === "left" ? -240 : 240;
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  const stopScrolling = () => {
    if (scrollIntervalRef.current !== null) {
      clearTimeout(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const startScrolling = (direction: "left" | "right") => {
    stopScrolling();
    
    // Scroll once immediately
    scroll(direction);

    // Repeat scroll every 800ms if hover continues
    const repeatScroll = () => {
      scroll(direction);
      scrollIntervalRef.current = setTimeout(repeatScroll, 800);
    };
    scrollIntervalRef.current = setTimeout(repeatScroll, 800);
  };

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

  const updateScrollButtons = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      const atStart = scrollLeft <= 2;
      const atEnd = scrollLeft >= scrollWidth - clientWidth - 2;

      // Left button state machine
      if (atStart) {
        setLeftState((prev) => {
          if (prev === "active") {
            if (leftTimerRef.current) clearTimeout(leftTimerRef.current);
            leftTimerRef.current = setTimeout(() => {
              setLeftState((curr) => (curr === "disabled" ? "hidden" : curr));
            }, 500);
            return "disabled";
          }
          return prev;
        });
      } else {
        if (leftTimerRef.current) {
          clearTimeout(leftTimerRef.current);
          leftTimerRef.current = null;
        }
        setLeftState("active");
      }

      // Right button state machine
      if (atEnd) {
        setRightState((prev) => {
          if (prev === "active") {
            if (rightTimerRef.current) clearTimeout(rightTimerRef.current);
            rightTimerRef.current = setTimeout(() => {
              setRightState((curr) => (curr === "disabled" ? "hidden" : curr));
            }, 500);
            return "disabled";
          }
          return prev;
        });
      } else {
        if (rightTimerRef.current) {
          clearTimeout(rightTimerRef.current);
          rightTimerRef.current = null;
        }
        setRightState("active");
      }
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.addEventListener("scroll", updateScrollButtons);
      updateScrollButtons();
      const observer = new ResizeObserver(updateScrollButtons);
      observer.observe(el);
      return () => {
        el.removeEventListener("scroll", updateScrollButtons);
        observer.disconnect();
        if (leftTimerRef.current) clearTimeout(leftTimerRef.current);
        if (rightTimerRef.current) clearTimeout(rightTimerRef.current);
        stopScrolling();
      };
    }
  }, [posts]);

  // scroll function moved above stopScrolling

  if (isLoading) {
    return (
      <div className="w-full flex gap-2 py-1 overflow-hidden">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton key={n} className="h-7 w-40 rounded-full shrink-0" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return null;
  }

  return (
    <TooltipProvider delayDuration={100}>
      <div className="w-full flex flex-col relative select-none">
        <style dangerouslySetInnerHTML={{__html: `
          .no-scrollbar::-webkit-scrollbar {
            display: none;
          }
          .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
        `}} />
        
        <div className="relative w-full flex items-center">
          {/* Fading left gradient */}
          <div className={`absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-background to-transparent pointer-events-none z-10 transition-opacity duration-200 ${leftState !== "hidden" ? "opacity-100" : "opacity-0"}`} />
          
          {/* Left slide button */}
          <button
            type="button"
            onMouseEnter={() => leftState === "active" && startScrolling("left")}
            onMouseLeave={stopScrolling}
            onClick={() => leftState === "active" && scroll("left")}
            className={`absolute left-0 z-20 flex size-6 items-center justify-center rounded-full bg-background border border-border shadow-sm transition-all duration-200 ${
              leftState === "active" 
                ? "hover:bg-accent hover:text-accent-foreground cursor-pointer opacity-100" 
                : leftState === "disabled"
                ? "opacity-35 cursor-not-allowed text-muted-foreground/60"
                : "opacity-0 pointer-events-none text-muted-foreground/60"
            }`}
          >
            <ChevronLeft className="size-3.5" />
          </button>

          {/* Scrollable list */}
          <div
            ref={scrollRef}
            className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto scroll-smooth w-full py-1 px-1"
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
                      className="flex items-center gap-1.5 px-3 py-1 bg-background border border-border rounded-full hover:bg-accent/40 hover:border-primary/30 transition-all duration-200 text-[11px] font-semibold text-foreground cursor-pointer select-none whitespace-nowrap shadow-sm hover:shadow active:scale-[0.98] group animate-fade-in"
                    >
                      <span className={`p-0.5 rounded-full ${config.colorClass} group-hover:scale-110 transition-transform`}>
                        <Icon className="size-3" />
                      </span>
                      <span className="truncate max-w-[180px]">{item.title}</span>
                      <ArrowUpRight className="size-3 text-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent className="p-3 max-w-sm flex flex-col gap-1.5 shadow-xl border border-border bg-popover text-popover-foreground z-[100] rounded-lg">
                    <div className="flex items-center justify-between gap-4">
                      <span className={`text-[9px] font-bold px-2 py-0.5 border uppercase rounded inline-flex ${config.colorClass}`}>
                        {item.category}
                      </span>
                      {item.document_type && (
                        <span className="text-[9px] text-foreground/75 uppercase bg-muted px-1.5 py-0.5 rounded">
                          {item.document_type}
                        </span>
                      )}
                    </div>
                    <h2 className="font-bold text-xs text-foreground mt-1 leading-snug">{item.title}</h2>
                    {item.summary && (
                      <p className="text-xs text-foreground/85 leading-normal mt-0.5 whitespace-normal break-words">
                        {item.summary}
                      </p>
                    )}
                    <div className="text-[10px] text-foreground/70 border-t border-border/60 pt-1 mt-1 flex items-center justify-between">
                      <span>Đăng lúc: {new Date(item.pinned_date).toLocaleDateString("vi-VN")}</span>
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>

          {/* Fading right gradient */}
          <div className={`absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none z-10 transition-opacity duration-200 ${rightState !== "hidden" ? "opacity-100" : "opacity-0"}`} />
          
          {/* Right slide button */}
          <button
            type="button"
            onMouseEnter={() => rightState === "active" && startScrolling("right")}
            onMouseLeave={stopScrolling}
            onClick={() => rightState === "active" && scroll("right")}
            className={`absolute right-0 z-20 flex size-6 items-center justify-center rounded-full bg-background border border-border shadow-sm transition-all duration-200 ${
              rightState === "active" 
                ? "hover:bg-accent hover:text-accent-foreground cursor-pointer opacity-100" 
                : rightState === "disabled"
                ? "opacity-35 cursor-not-allowed text-muted-foreground/60"
                : "opacity-0 pointer-events-none text-muted-foreground/60"
            }`}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </div>
    </TooltipProvider>
  );
}
