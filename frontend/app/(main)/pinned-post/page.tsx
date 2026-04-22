"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinnedPostListPanel } from "@/components/features/pinned-posts/PinnedPostListPanel";

export default function PinnedPostsPage() {
  const router = useRouter();

  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="p-4 sm:p-8 w-full">
        <div className="max-w-350 mx-auto">
          <div className="mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/")}
              className="gap-1.5 text-primary hover:bg-muted h-auto px-3 py-1 text-sm font-semibold"
            >
              <ArrowLeft className="w-5 h-5" />
              Quay lại
            </Button>
          </div>

          <PinnedPostListPanel />
        </div>
      </div>
    </div>
  );
}
