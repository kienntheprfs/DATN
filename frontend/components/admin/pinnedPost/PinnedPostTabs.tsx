"use client";

import React from "react";

type PinnedViewMode = "list" | "create";

interface PinnedPostTabsProps {
  mode: PinnedViewMode;
  onChangeMode: (mode: PinnedViewMode) => void;
}

export function PinnedPostTabs({ mode, onChangeMode }: PinnedPostTabsProps) {
  const baseClassName =
    "px-3 py-2 text-[13px] font-medium transition-colors duration-200 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

  return (
    <div className="mb-6 border-b border-border-color">
      <div className="flex min-w-max items-center gap-2 overflow-x-auto pb-1">
        <span className="px-3 py-2 text-[13px] text-text-main">Admin</span>
        <button
          type="button"
          className={`${baseClassName} ${
            mode === "list"
              ? "bg-primary/10 text-primary"
              : "text-text-secondary hover:bg-slate-100 hover:text-primary"
          }`}
          onClick={() => onChangeMode("list")}
          aria-pressed={mode === "list"}
        >
          Pinned Topics
        </button>
        <button
          type="button"
          className={`${baseClassName} ${
            mode === "create"
              ? "bg-primary/10 text-primary"
              : "text-text-secondary hover:bg-slate-100 hover:text-primary"
          }`}
          onClick={() => onChangeMode("create")}
          aria-pressed={mode === "create"}
        >
          Add New Pin
        </button>
      </div>
    </div>
  );
}
