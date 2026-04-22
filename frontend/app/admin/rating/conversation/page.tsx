"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatWindow } from "@/components/chat/chat-window";
import { Button } from "@/components/ui/button";
import { useAgent } from "@/contexts/agent-context";
import { useChat } from "@/hooks/use-chat";

export default function AdminRatingConversationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { model, agent } = useAgent();

  const threadId = searchParams.get("thread_id") || "";

  const chatKey = useMemo(() => `admin-rating-conversation-${threadId || "unknown"}`, [threadId]);

  const { messages, isLoading, isTyping, currentTools, error } = useChat({
    model: model || "gpt-5-nano",
    agent: agent || "chatbot",
    threadId: threadId || undefined,
    key: chatKey,
  });

  return (
    <div className="max-w-400 mx-auto w-full h-[calc(100vh-65px)] min-h-0 flex flex-col relative">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-heading font-bold text-text-main tracking-tight">Xem lại hội thoại</h1>
          <p className="text-sm text-text-secondary mt-1">Hiển thị theo chế độ chỉ đọc trong khu vực quản trị.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (window.history.length > 1) {
              router.back();
              return;
            }
            router.push("/admin/rating");
          }}
          className="gap-2"
        >
          <ArrowLeft className="size-4" />
          Quay lại
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden border border-border-color bg-white rounded-md">
        <ChatWindow
          messages={messages}
          error={error}
          isStreaming={isLoading}
          isTyping={isTyping}
          currentTools={currentTools}
          threadId={threadId || undefined}
          agentId={agent || "chatbot"}
          readOnly
        />
      </div>

      <div className="sticky bottom-0 mt-2 border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-center text-amber-800 z-10">
        Chế độ chỉ đọc: bạn chỉ có thể xem lại hội thoại gốc, không thể gửi tin nhắn mới.
      </div>
    </div>
  );
}
