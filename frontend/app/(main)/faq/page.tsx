"use client";

import { useState, useDeferredValue } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FAQListPanel } from "@/components/features/faq/FAQListPanel";
import { useAppStore } from "@/stores/app.store";

export default function FAQPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { user } = useAppStore();
  const isAdmin = user?.roles?.some((r) => r.name === "admin") || user?.is_superuser;
  const debouncedSearch = useDeferredValue(searchQuery);

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="p-4 sm:p-8 w-full">
        <div className="max-w-6xl mx-auto flex flex-col gap-6">
          <div className="flex flex-col gap-6 shrink-0">
            <div>
              <h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">
                Quản lý Câu hỏi thường gặp
              </h1>
              <p className="text-sm text-text-secondary mt-1">
                Tạo và quản lý các câu hỏi thường gặp cho chatbot.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <Input
                type="search"
                placeholder="Tìm kiếm câu hỏi hoặc câu trả lời..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-surface border-border-color"
              />
            </div>
            
          </div>

          <FAQListPanel searchQuery={debouncedSearch} isAdmin={isAdmin ?? false} />
        </div>
      </div>
    </div>
  );
}