"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, SlidersHorizontal, AudioLinesIcon, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { InputGroupTextarea } from "@/components/ui/input-group"; 

interface ChatInputProps {
  // Hàm này sẽ được gọi ở trang /chat khi bấm gửi
  onSubmitMessage?: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInput({ onSubmitMessage, isLoading = false }: ChatInputProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim() || isLoading) return;

    if (onSubmitMessage) {
      // Đang ở trang Chat: Truyền text lên cho useChat xử lý, rồi xóa ô input
      onSubmitMessage(message);
      setMessage(""); 
    } else {
      // Đang ở trang Chủ: Gom câu hỏi vào URL và chuyển trang
      const params = new URLSearchParams({ q: message });
      router.push(`/chat?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Nhấn Enter để gửi (Nhấn Shift+Enter để xuống dòng)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col overflow-hidden border border-border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50 rounded-none">
        
        {/* Hàng 1: Textarea */}
        <InputGroupTextarea 
          id="chat-textarea" 
          placeholder="Nhập câu hỏi hoặc yêu cầu tra cứu..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* Hàng 2: Toolbar */}
        <div className="flex items-center justify-between bg-muted/20 px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Paperclip className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Đính kèm tài liệu</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground">
                  <SlidersHorizontal className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cấu hình tra cứu</TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground hover:bg-primary/10 hover:text-primary">
                  <AudioLinesIcon className="size-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tìm kiếm bằng giọng nói</TooltipContent>
            </Tooltip>

            <Button 
              variant="default" 
              className="rounded-none font-bold"
              onClick={handleSend}
              disabled={!message.trim() || isLoading}
            >
              <Send className="mr-2 size-4" />
              {isLoading ? "Đang xử lý..." : "Tra cứu"}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}