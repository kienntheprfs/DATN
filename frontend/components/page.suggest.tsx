"use client";

import { useEffect } from "react";
import { Flame, Newspaper } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { useSuggestionStore } from "@/stores/suggest.store";
// Nhớ kiểm tra lại đường dẫn import các component Item của bạn cho đúng nha
import { Item, ItemGroup, ItemMedia, ItemContent, ItemTitle, ItemDescription, ItemActions } from "@/components/ui/item"; // Ví dụ đường dẫn

// --- TỪ ĐIỂN MAP STRING SANG ICON THẬT ---
const ICON_MAP: Record<string, any> = {
  flame: Flame,
  newspaper: Newspaper,
};

export default function SuggestionSection() {
  // Bóc tách state và action từ Zustand store
  const { suggestions, isLoadingSuggestions, fetchSuggestions } = useSuggestionStore();

  // Gọi API lấy dữ liệu khi component vừa mount
  useEffect(() => {
    if (!suggestions && !isLoadingSuggestions) {
      fetchSuggestions();
    }
  }, [suggestions, isLoadingSuggestions, fetchSuggestions]);

  // --- TRẠNG THÁI 1: HIỆU ỨNG SKELETON (ĐANG TẢI) ---
  if (isLoadingSuggestions || !suggestions) {
    return (
      <div className="flex w-full max-w-3xl flex-col items-center justify-center gap-2 text-sm text-muted-foreground animate-pulse">
        {/* Skeleton thẻ HOT */}
        <div className="w-full border border-border bg-muted p-4 h-40 flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="size-12 shrink-0 bg-muted-foreground/20" />
            <div className="flex w-full flex-col gap-2">
              <div className="h-6 w-1/4 bg-muted-foreground/20" />
              <div className="h-5 w-1/2 bg-muted-foreground/20" />
            </div>
          </div>
          <div className="mt-auto h-4 w-3/4 bg-muted-foreground/20" />
        </div>

        {/* Skeleton thẻ thường */}
        <div className="mt-3 grid w-full grid-cols-1 gap-3 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex h-24 w-full items-center gap-4 border border-border bg-muted p-4">
              <div className="size-12 shrink-0 bg-muted-foreground/20" />
              <div className="flex w-full flex-col gap-2">
                <div className="h-5 w-1/2 bg-muted-foreground/20" />
                <div className="h-4 w-3/4 bg-muted-foreground/20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Khai báo Icon cho thẻ HOT
  const HotIcon = ICON_MAP[suggestions.hotTopic.iconName] || Flame;

  // --- TRẠNG THÁI 2: ĐÃ CÓ DATA TỪ STORE ---
  return (
    <div className="flex flex-col w-full max-w-3xl items-center justify-center gap-2 text-sm text-muted-foreground">
      
      {/* --- THẺ HOT --- */}
      <div className="w-full">
        <Item
          variant="outline"
          className="relative overflow-visible border-red-500 p-4 transition-colors hover:bg-red-50/80 cursor-pointer"
        >
          {/* TAG "HOT" TRÔI NỔI */}
          <div className="absolute right-2 top-2 flex h-6 items-center justify-center bg-red-600 px-3 text-xs font-bold text-white shadow-md">
            HOT
          </div>

          <ItemMedia variant="icon" className="flex size-12 items-center justify-center bg-red-100 text-red-600 shrink-0">
            <HotIcon className="size-6" />
          </ItemMedia>

          <ItemContent className="w-full">
            <div className="flex flex-col w-full items-start justify-between gap-2">
              <Badge className="bg-red-100 text-red-700 rounded-none shadow-none border-none">
                {suggestions.hotTopic.badge}
              </Badge>
              <ItemTitle className="font-bold text-lg text-red-700">
                {suggestions.hotTopic.title}
              </ItemTitle>
            </div>

            <ItemDescription className="text-red-700/80 mt-1">
              {suggestions.hotTopic.description}
            </ItemDescription>
            
            <ItemActions className="mt-3">
              <Link className="text-primary font-bold hover:underline" href={suggestions.hotTopic.link}>
                Tìm hiểu chi tiết
              </Link>
            </ItemActions>
          </ItemContent>
        </Item>
      </div>

      {/* --- CÁC THẺ THƯỜNG --- */}
      <ItemGroup className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 mt-3">
        {suggestions.regularTopics.map((topic) => {
          const TopicIcon = ICON_MAP[topic.iconName] || Newspaper;
          
          return (
            <Item 
              key={topic.id} 
              variant="outline" 
              className="transition-colors hover:bg-muted/50 cursor-pointer p-4"
            >
              <ItemMedia variant="icon" className="flex size-12 items-center justify-center bg-secondary text-secondary-foreground shrink-0">
                <TopicIcon className="size-6" />
              </ItemMedia>
              <ItemContent>
                <ItemTitle className="text-lg text-foreground font-bold">
                  {topic.title}
                </ItemTitle>
                <ItemDescription className="text-muted-foreground mt-1">
                  {topic.description}
                </ItemDescription>
              </ItemContent>
            </Item>
          );
        })}
      </ItemGroup>

    </div>
  );
}