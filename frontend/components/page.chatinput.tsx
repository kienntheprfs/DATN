"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Mic, MicOff, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { VoiceButton } from "@/components/voice-button";
import { VoiceConnectionState } from "@/hooks/use-voice";
import { authService } from "@/services/auth-api";

export type QueryMode = "normal" | "deep";

interface ChatInputProps {
  onSubmitMessage?: (message: string, queryMode?: QueryMode) => void;
  onSubmitAndRedirect?: (message: string, queryMode?: QueryMode) => void;
  isLoading?: boolean;
  voiceAgentId?: string;
  userId?: string;
  voiceModel?: string;
  voiceState?: VoiceConnectionState;
  isListening?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  onVoiceTranscript?: (text: string) => void;
  onVoiceBotOutput?: (text: string) => void;
  onVoiceToggle?: () => void;
  onVoiceMute?: () => void;
  showDocumentButton?: boolean;
  onDocumentToggle?: () => void;
}

export function ChatInput({
  onSubmitMessage,
  onSubmitAndRedirect,
  isLoading = false,
  voiceAgentId = "chatbot",
  userId,
  voiceModel,
  voiceState = "idle",
  isListening = false,
  isSpeaking = false,
  isMuted = false,
  onVoiceTranscript,
  onVoiceBotOutput,
  onVoiceToggle,
  onVoiceMute,
  showDocumentButton = false,
  onDocumentToggle,
}: ChatInputProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [queryMode, setQueryMode] = useState<QueryMode>("normal");
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(authService.isAuthenticated());
  }, []);

  const toggleQueryMode = () => {
    if (!authService.isAuthenticated()) {
      toast.error("Yêu cầu đăng nhập để sử dụng tính năng");
      return;
    }
    setQueryMode((prev) => (prev === "normal" ? "deep" : "normal"));
  };

  const handleVoiceToggle = () => {
    if (onVoiceToggle) {
      onVoiceToggle();
    }
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || isLoading) return;

    if (trimmedMessage.length > 5000) {
      toast.error("Tin nhắn quá dài. Vui lòng nhập tối đa 5000 ký tự.");
      return;
    }

    if (onSubmitMessage) {
      onSubmitMessage(trimmedMessage, queryMode);
      setMessage(""); 
    } else if (onSubmitAndRedirect) {
      onSubmitAndRedirect(trimmedMessage, queryMode);
      setMessage("");
    } else {
      const threadId = crypto.randomUUID();
      const params = new URLSearchParams({ thread_id: threadId, message: trimmedMessage });
      router.push(`/chat?${params.toString()}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isVoiceConnected = voiceState === "connected";
  const isDeepMode = queryMode === "deep";

  return (
    <TooltipProvider>
      <div className="flex w-full flex-col overflow-hidden border border-border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50 rounded-none">
        
        <InputGroupTextarea 
          id="chat-textarea" 
          aria-label="Nhập câu hỏi hoặc yêu cầu tra cứu"
          placeholder="Nhập câu hỏi hoặc yêu cầu tra cứu..." 
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between bg-muted/20 px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={isDeepMode ? "Tắt chế độ tìm kiếm sâu" : "Bật chế độ tìm kiếm sâu"}
                  className={`size-11 rounded-none min-w-11 ${isDeepMode ? "text-purple-600 bg-purple-50 hover:bg-purple-100" : "text-muted-foreground hover:bg-muted"} ${!isLoggedIn ? "opacity-50" : ""}`}
                  onClick={toggleQueryMode}
                >
                  <Sparkles className="size-4" aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isLoggedIn ? (isDeepMode ? "Tắt suy nghĩ kỹ" : "Suy nghĩ kỹ hơn") : "Yêu cầu đăng nhập để sử dụng"}
              </TooltipContent>
            </Tooltip>
            {showDocumentButton && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Hiển thị tài liệu"
                    className="size-11 rounded-none min-w-11 text-muted-foreground hover:bg-muted"
                    onClick={onDocumentToggle}
                  >
                    <FileText className="size-4" aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Hiển thị tài liệu
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isVoiceConnected && onVoiceMute && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={isMuted ? "destructive" : "secondary"}
                    size="icon"
                    className="size-9 rounded-none"
                    onClick={onVoiceMute}
                  >
                    {isMuted ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isMuted ? "Bật mic" : "Tắt mic"}</TooltipContent>
              </Tooltip>
            )}

            <VoiceButton
              agentId={voiceAgentId}
              userId={userId}
              model={voiceModel}
              onTranscript={onVoiceTranscript}
              onBotOutput={onVoiceBotOutput}
              externalState={voiceState}
              externalIsListening={isListening}
              externalIsSpeaking={isSpeaking}
              onToggle={handleVoiceToggle}
            />

            <Button
              variant={isLoading ? "destructive" : "default"}
              aria-label={isLoading ? "Đang xử lý" : "Gửi tin nhắn"}
              className="rounded-none font-bold min-h-11 px-6"
              onClick={handleSend}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Đang xử lý...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" aria-hidden="true" />
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
