"use client";

import { ExternalLink } from "lucide-react";

interface PinnedPostCardProps {
  id: string;
  category: string;
  categoryColor: {
    bg: string;
    border: string;
    text: string;
  };
  title: string;
  description: string;
  date: string;
  link?: string;
}

export function PinnedPostCard({
  category,
  categoryColor,
  title,
  description,
  date,
  link = "#",
}: PinnedPostCardProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-6 hover:bg-muted/50 transition-colors duration-150">
      {/* Content Section */}
      <div className="flex-1 min-w-0">
        {/* Category Badge */}
        <div className="mb-1">
          <span
            className={`text-[10px] font-bold px-2 py-0.5 border uppercase rounded inline-flex ${categoryColor.bg} ${categoryColor.border} ${categoryColor.text}`}
          >
            {category}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-foreground leading-tight mb-1">
          {title}
        </h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed max-w-4xl line-clamp-2">
          {description}
        </p>
      </div>

      {/* Meta Section - Date & Link */}
      <div className="flex items-center gap-6 shrink-0 min-w-50 justify-between md:justify-end">
        {/* Date */}
        <span className="text-[11px] text-muted-foreground font-medium whitespace-nowrap">
          {date}
        </span>

        {/* View Original Link */}
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-bold text-primary flex items-center gap-1 hover:underline uppercase whitespace-nowrap group"
        >
          VIEW ORIGINAL
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>
    </div>
  );
}
