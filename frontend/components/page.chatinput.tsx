"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, Mic, MicOff, Sparkles, FileText, MessageSquare, Navigation, Settings, Map, Image } from "lucide-react";
import { useAgent } from "@/contexts/agent-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { VoiceButton } from "@/components/voice-button";
import { VoiceConnectionState } from "@/hooks/use-voice";
import { authService } from "@/services/auth-api";
import QuickSuggestions from "@/components/quick-suggestions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

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
  onSendVoiceTextMessage?: (message: string) => void;
  showDocumentButton?: boolean;
  onDocumentToggle?: () => void;
  defaultQueryMode?: QueryMode;
  hasRouteData?: boolean;
  hasLandmarkData?: boolean;
  onShowRoute?: () => void;
  onShowLandmarks?: () => void;
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
  onSendVoiceTextMessage,
  showDocumentButton = false,
  onDocumentToggle,
  defaultQueryMode,
  hasRouteData = false,
  hasLandmarkData = false,
  onShowRoute,
  onShowLandmarks,
}: ChatInputProps) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [queryMode, setQueryMode] = useState<QueryMode>("normal");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { agent, setAgent, agents, isOnline } = useAgent();

  useEffect(() => {
    const authenticated = authService.isAuthenticated();
    setIsLoggedIn(authenticated);
    if (authenticated) {
      if (defaultQueryMode) {
        setQueryMode(defaultQueryMode);
        if (typeof window !== "undefined") {
          localStorage.setItem("selectedQueryMode", defaultQueryMode);
        }
      } else if (typeof window !== "undefined") {
        const savedMode = localStorage.getItem("selectedQueryMode") as QueryMode;
        if (savedMode === "normal" || savedMode === "deep") {
          setQueryMode(savedMode);
        }
      }
    } else {
      setQueryMode("normal");
    }
  }, [defaultQueryMode]);

  const toggleQueryMode = () => {
    if (!authService.isAuthenticated()) {
      toast.error("Yêu cầu đăng nhập để sử dụng tính năng");
      return;
    }
    setQueryMode((prev) => {
      const newMode = prev === "normal" ? "deep" : "normal";
      if (typeof window !== "undefined") {
        localStorage.setItem("selectedQueryMode", newMode);
      }
      return newMode;
    });
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
      if (queryMode === "deep") {
        params.set("query_mode", "deep");
      }
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
      <div className="flex w-full flex-col gap-3">
        <QuickSuggestions />

        <div className="flex w-full flex-col overflow-hidden border border-border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50 rounded-none">

        <InputGroupTextarea 
          id="chat-textarea" 
          aria-label={isVoiceConnected ? "Nhập tin nhắn văn bản vào Voice Chat" : "Nhập câu hỏi hoặc yêu cầu tra cứu"}
          placeholder={isVoiceConnected ? "Gửi tin nhắn văn bản vào cuộc trò chuyện Voice..." : "Nhập câu hỏi hoặc yêu cầu tra cứu..." }
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className="flex items-center justify-between bg-muted/20 px-3 pb-3 pt-1">
          <div className="flex items-center gap-1">
            {/* Agent Switcher Integrated */}
            {isOnline && (
              <div className="flex items-center bg-muted/40 rounded-sm p-0.5 mr-1 border border-border/50 h-9 shrink-0">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Cấu hình agent"
                      data-testid="agent-settings-trigger"
                      className="h-full px-3 rounded-none text-[11px] font-semibold bg-background hover:bg-muted text-foreground transition-all gap-1.5 border-none shadow-none"
                    >
                      <Settings className="size-3.5 text-muted-foreground animate-hover-spin" />
                      <span className="text-muted-foreground font-normal">Agent:</span>
                      <span className="max-w-[160px] truncate font-bold text-primary">
                        {agent === "router-agent" ? "Trợ lý thông minh" : (agent === "knowledge-base-agent" ? "Hỏi đáp quy chế" : (agent === "map-assistant" ? "Bản đồ & Chỉ đường" : agent))}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-60 bg-popover border border-border p-1 shadow-md rounded-md z-50">
                    <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold text-foreground">Chọn Agent hoạt động</DropdownMenuLabel>
                    <DropdownMenuSeparator className="-mx-1 my-1 h-px bg-border" />
                    {agents && agents.map((a) => (
                      <DropdownMenuItem
                        key={a.key}
                        onClick={() => setAgent(a.key)}
                        className={`flex flex-col items-start gap-0.5 px-2 py-1.5 text-sm rounded-sm cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground select-none outline-none ${
                          agent === a.key ? "bg-accent text-accent-foreground font-semibold" : ""
                        }`}
                      >
                        <div className="flex items-center gap-1.5 w-full justify-between">
                          <span className="font-bold text-xs">
                            {a.key === "router-agent" ? "Trợ lý thông minh (Mặc định)" : (a.key === "knowledge-base-agent" ? "Hỏi đáp quy chế" : (a.key === "map-assistant" ? "Bản đồ & Chỉ đường" : a.key))}
                          </span>
                          {agent === a.key && (
                            <span className="size-1.5 rounded-full bg-primary" />
                          )}
                        </div>
                        {a.description && (
                          <div className="text-[10px] text-muted-foreground line-clamp-2">
                            {a.description}
                          </div>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={isDeepMode ? "Tắt chế độ tìm kiếm sâu" : "Bật chế độ tìm kiếm sâu"}
                  className={`size-11 rounded-none min-w-11 ${
                    isDeepMode 
                      ? "text-purple-600 bg-purple-50 hover:bg-purple-100" 
                      : "text-muted-foreground hover:bg-muted"
                  } ${!isLoggedIn ? "opacity-50" : ""}`}
                  onClick={toggleQueryMode}
                  data-testid="deep-mode-toggle"
                  disabled={isVoiceConnected}
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
            {hasRouteData && onShowRoute && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Xem bản đồ chỉ đường"
                    className="h-11 px-3 rounded-none text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-primary transition-all gap-1.5"
                    onClick={onShowRoute}
                  >
                    <Map className="size-4 text-primary" aria-hidden="true" />
                    <span>Xem bản đồ</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Xem bản đồ chỉ đường</TooltipContent>
              </Tooltip>
            )}

            {hasLandmarkData && onShowLandmarks && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Xem hình ảnh gợi ý"
                    className="h-11 px-3 rounded-none text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-primary transition-all gap-1.5"
                    onClick={onShowLandmarks}
                  >
                    <Image className="size-4 text-primary" aria-hidden="true" />
                    <span>Xem ảnh gợi ý</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Xem hình ảnh địa điểm gợi ý</TooltipContent>
              </Tooltip>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isVoiceConnected && onVoiceMute && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`size-11 rounded-none min-w-11 transition-colors duration-200 ${
                      isMuted 
                        ? "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50" 
                        : "bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950/50"
                    }`}
                    onClick={onVoiceMute}
                  >
                    {isMuted ? <MicOff className="size-5" /> : <Mic className="size-5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{isMuted ? "Bật mic" : "Tắt mic"}</TooltipContent>
              </Tooltip>
            )}

            <VoiceButton
              agentId={agent}
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
      </div>
    </TooltipProvider>
  );
}
