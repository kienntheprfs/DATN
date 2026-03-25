"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, SlidersHorizontal, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { VoiceButton } from "@/components/voice-button";

interface ChatInputProps {
  onSubmitMessage?: (message: string) => void;
  isLoading?: boolean;
  voiceServerUrl?: string;
  voiceAgentId?: string;
  voiceModel?: string;
  onVoiceTranscript?: (text: string) => void;
}

export function ChatInput({
  onSubmitMessage,
  isLoading = false,
  voiceServerUrl = "http://localhost:7860",
  voiceAgentId = "chatbot",
  voiceModel,
  onVoiceTranscript,
}: ChatInputProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim() || isLoading) return;

    if (onSubmitMessage) {
      onSubmitMessage(message);
      setMessage(""); 
    } else {
      const params = new URLSearchParams({ q: message });
      router.push(`/chat?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col overflow-hidden border border-border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50 rounded-none">
        
        <InputGroupTextarea 
          id="chat-textarea" 
          placeholder="Nhập câu hỏi hoặc yêu cầu tra cứu..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

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
            <VoiceButton
              voiceServerUrl={voiceServerUrl}
              agentId={voiceAgentId}
              model={voiceModel}
              onTranscript={onVoiceTranscript}
            />

            <Button
              variant={isLoading ? "destructive" : "default"}
              className="rounded-none font-bold"
              onClick={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" />
                  Tra cứu
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
