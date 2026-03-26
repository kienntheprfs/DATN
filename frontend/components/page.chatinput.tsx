"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, SlidersHorizontal, Send, Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { VoiceButton } from "@/components/voice-button";
import { VoiceConnectionState } from "@/hooks/use-voice";

interface ChatInputProps {
  onSubmitMessage?: (message: string) => void;
  isLoading?: boolean;
  voiceServerUrl?: string;
  voiceAgentId?: string;
  voiceModel?: string;
  voiceState?: VoiceConnectionState;
  isListening?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
  onVoiceTranscript?: (text: string) => void;
  onVoiceBotOutput?: (text: string) => void;
  onVoiceToggle?: () => void;
  onVoiceMute?: () => void;
}

export function ChatInput({
  onSubmitMessage,
  isLoading = false,
  voiceServerUrl = "http://localhost:7860",
  voiceAgentId = "chatbot",
  voiceModel,
  voiceState = "idle",
  isListening = false,
  isSpeaking = false,
  isMuted = false,
  onVoiceTranscript,
  onVoiceBotOutput,
  onVoiceToggle,
  onVoiceMute,
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

  const isVoiceConnected = voiceState === "connected";

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
              voiceServerUrl={voiceServerUrl}
              agentId={voiceAgentId}
              model={voiceModel}
              onTranscript={onVoiceTranscript}
              onBotOutput={onVoiceBotOutput}
              externalState={voiceState}
              externalIsListening={isListening}
              externalIsSpeaking={isSpeaking}
              onToggle={onVoiceToggle}
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
