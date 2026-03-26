"use client";

import React, { useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useVoice, VoiceConnectionState } from "@/hooks/use-voice";

interface VoiceButtonProps {
  className?: string;
  voiceServerUrl?: string;
  agentId?: string;
  model?: string;
  onTranscript?: (text: string) => void;
  onBotOutput?: (text: string) => void;
  externalState?: VoiceConnectionState;
  externalIsListening?: boolean;
  externalIsSpeaking?: boolean;
  onToggle?: () => void;
}

export function VoiceButton({
  className,
  voiceServerUrl,
  agentId = "chatbot",
  model,
  onTranscript,
  onBotOutput,
  externalState,
  externalIsListening,
  externalIsSpeaking,
  onToggle,
}: VoiceButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const internalVoice = useVoice({
    voiceServerUrl,
    agentId,
    model,
    onTranscript,
    onBotOutput,
    onError: (err) => console.error("Voice error:", err),
  });

  const state = externalState ?? internalVoice.state;
  const isListening = externalIsListening ?? internalVoice.isListening;
  const isSpeaking = externalIsSpeaking ?? internalVoice.isSpeaking;
  const error = internalVoice.error;
  const startConversation = internalVoice.startConversation;
  const stopConversation = internalVoice.stopConversation;

  const handleClick = () => {
    if (onToggle) {
      onToggle();
    } else if (state === "connected") {
      stopConversation();
    } else if (state === "idle" || state === "disconnected" || state === "error") {
      startConversation();
    }
  };

  const getIcon = () => {
    if (state === "connecting") {
      return <Loader2 className="size-5 animate-spin" />;
    }
    if (isSpeaking) {
      return <Mic className="size-5 text-red-500 animate-pulse" />;
    }
    if (isListening) {
      return <Mic className="size-5 text-green-500" />;
    }
    if (state === "error") {
      return <MicOff className="size-5 text-red-500" />;
    }
    return <Mic className="size-5" />;
  };

  const getTooltipContent = () => {
    switch (state) {
      case "connecting":
        return "Đang kết nối...";
      case "connected":
        if (isSpeaking) return "Bot đang nói...";
        if (isListening) return "Đang nghe... Nhấn để dừng";
        return "Đã kết nối";
      case "error":
        return `Lỗi: ${error || "Không thể kết nối"}. Nhấn để thử lại`;
      default:
        return "Tìm kiếm bằng giọng nói";
    }
  };

  const isActive = state === "connected" || state === "connecting";
  const isDisabled = state === "connecting";

  return (
    <Tooltip open={showTooltip} onOpenChange={setShowTooltip}>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`size-9 rounded-none transition-all ${
            isActive
              ? "bg-primary/20 text-primary hover:bg-primary/30"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          } ${className || ""}`}
          onClick={handleClick}
          disabled={isDisabled}
        >
          {getIcon()}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{getTooltipContent()}</TooltipContent>
    </Tooltip>
  );
}
