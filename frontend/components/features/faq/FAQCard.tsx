"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FAQQuestion {
  id: number;
  question: string;
  embedding_id: string;
}

interface FAQCardProps {
  id: number;
  question: string;
  answer: string;
  source: string;
  createdAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function FAQCard({ id, question, answer, source, createdAt }: FAQCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="border border-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-4 p-4 text-left hover:bg-muted/50 transition-colors duration-150"
        >
          <div className="flex-1 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="text-base font-semibold text-foreground leading-tight line-clamp-2 text-left">
                  {question}
                </h3>
              </TooltipTrigger>
              <TooltipContent className="max-w-md">{question}</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap hidden sm:block">
              {formatDate(createdAt)}
            </span>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {isOpen && (
          <div className="px-4 pb-4 pt-0 border-t border-border/50">
            <div className="pt-4">
              <div
                className="text-sm text-muted-foreground leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: answer }}
              />
              {source && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <span className="text-xs text-muted-foreground">
                    Nguồn: <span className="font-medium">{source}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}