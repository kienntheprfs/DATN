"use client";

import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useAgent } from "@/contexts/agent-context";
import { useVoice } from "@/hooks/use-voice";
import { useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatInput, QueryMode } from "@/components/page.chatinput";
import { DocumentPanel } from "@/components/chat/document-panel";
import { toast } from "sonner";
import { getUserId, authService } from "@/services/auth-api";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useAppStore } from "@/stores/app.store";
import { MiniNavigation } from "@/components/chat/MapPreview";
import { LandmarkCarousel } from "@/components/chat/LandmarkCarousel";
import { CustomModal } from "@/components/features/faq/CustomModal";

function ChatContent({ onVoiceToggle, onConversationStart }: { onVoiceToggle: () => void; onConversationStart?: () => void }) {
	const searchParams = useSearchParams();
	const urlThreadId = searchParams.get("thread_id");
	const urlMessage = searchParams.get("message");
	const urlQueryMode = searchParams.get("query_mode") as QueryMode | null;
	const isReadOnly = searchParams.get("readonly") === "1";
	const shouldStartVoice = searchParams.get("voice") === "true";
	const hasAppended = useRef(false);
	const voiceStarted = useRef(false);
	const sendMessageRef = useRef<((message: string, queryMode?: QueryMode) => Promise<void>) | null>(null);
	const router = useRouter();
	const { model, agent } = useAgent();
	const { state } = useSidebar();
	const isMobile = useIsMobile();
	const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);
	const [showRouteModal, setShowRouteModal] = useState(false);
	const [showLandmarkModal, setShowLandmarkModal] = useState(false);

	const chatKey = useMemo(() => `chat-${urlThreadId || "new"}`, [urlThreadId]);

	const {
		messages,
		sendMessage,
		addUserMessage,
		addBotMessage,
		appendBotMessage,
		updateLastBotMessage,
		addVoiceToolCall,
		updateVoiceToolResult,
		stop,
		isLoading,
		isHistoryLoading,
		isTyping,
		currentTools,
		error,
		threadId,
	} = useChat({
		model: model || "gpt-5-nano",
		agent: agent || "chatbot",
		threadId: urlThreadId || undefined,
		initialMessage: isReadOnly ? undefined : urlMessage || undefined,
		initialQueryMode: urlQueryMode || undefined,
		key: chatKey,
	});

	const latestRouteData = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.msgType === "tool" && m.content) {
				try {
					const parsed = JSON.parse(m.content);
					if (parsed.type === "route" && parsed.status === "success") {
						return parsed;
					}
				} catch { }
			}
		}
		return null;
	}, [messages]);

	const latestLandmarkData = useMemo(() => {
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.msgType === "tool" && m.content) {
				try {
					const parsed = JSON.parse(m.content);
					if (Array.isArray(parsed)) return parsed;
					if (parsed.landmarks && Array.isArray(parsed.landmarks)) return parsed.landmarks;
					if (parsed.results && Array.isArray(parsed.results) && m.toolName === "GuessLocationByDescription") return parsed.results;
				} catch { }
			}
		}
		return null;
	}, [messages]);

	const citations = useMemo(() => {
		const allCitations: Array<{ file_name: string; s3_url: string; text_preview?: string; source_type: string; doc_id?: string; file_path?: string; is_faq?: boolean; faq_source?: string }> = [];

		// Find index of last user message
		const lastUserMsgIndex = [...messages].reverse().findIndex(m => m.role === "user");
		const startIndex = lastUserMsgIndex === -1 ? 0 : messages.length - 1 - lastUserMsgIndex;

		// Only process messages from the last user message onwards
		messages.slice(startIndex).forEach((msg) => {
			if (msg.citations && msg.citations.length > 0) {
				msg.citations.forEach((cite) => {
					if (!allCitations.some((c) => c.file_name === cite.file_name)) {
						allCitations.push(cite);
					}
				});
			}
		});
		return allCitations;
	}, [messages]);

	// Parse toolChunks from both currentTools and messages history
	const toolChunks = useMemo(() => {
		const chunks: { source: string; content: string }[] = [];
		const processedContents = new Set<string>();

		const stripMarkdown = (s: string) => {
			if (!s) return "";
			return s
				.replace(/(\*\*|__)(.*?)\1/g, "$2") // Bold
				.replace(/(\*|_)(.*?)\1/g, "$2") // Italic
				.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1") // Links
				.replace(/`([^`]+)`/g, "$1") // Inline code
				.replace(/^#+\s+/gm, "") // Headers
				.replace(/^\s*[\-\*\+•]\s+/gm, "") // Leading bullets
				.replace(/\s+/g, " ") // Normalize internal whitespace
				.trim();
		};

		const processContent = (content: string, name: string) => {
			if (!content || processedContents.has(content)) return;
			processedContents.add(content);

			// Try to parse as JSON first (like in chat-window.tsx)
			try {
				const parsed = JSON.parse(content);
				if (parsed.results && Array.isArray(parsed.results)) {
					parsed.results.forEach((result: any) => {
						const resContent = result.content || result.snippet;
						if (resContent) {
							chunks.push({
								source: result.title || name,
								content: stripMarkdown(resContent),
							});
						}
					});
					return;
				}
			} catch (e) {
				// Not JSON, continue with text parsing
			}

			// Format: "[Nguồn: Normal | Điểm: 0.30]: nội dung..."
			const parts = content.split(/\[Nguồn:\s*/);
			parts.slice(1).forEach((part) => {
				const match = part.match(/([^|\]]+)\s*\|[^\]]*\]:\s*([\s\S]+)/);
				if (match) {
					const chunkContent = stripMarkdown(match[2]);
					if (chunkContent) {
						chunks.push({
							source: match[1].trim(),
							content: chunkContent,
						});
					}
				}
			});
		};

		// Process current streaming tools
		currentTools.forEach((tool) => {
			if (tool.status === "done" && tool.content) {
				processContent(tool.content, tool.name);
			}
		});

		// Process historical tool messages - only from the latest user turn
		const lastUserMsgIndex = [...messages].reverse().findIndex(m => m.role === "user");
		const startIndex = lastUserMsgIndex === -1 ? 0 : messages.length - 1 - lastUserMsgIndex;

		messages.slice(startIndex).forEach((msg) => {
			if (msg.msgType === "tool" && msg.content) {
				const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
				processContent(content, msg.toolName || "tool");
			}
		});

		return chunks;
	}, [currentTools, messages]);

	const toolContents = useMemo(() => {
		const contents: Record<string, string> = {};
		messages.forEach((msg) => {
			if (msg.msgType === "tool" && msg.content) {
				const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
				const key = msg.toolName || msg.id;
				contents[key] = content;
			}
		});
		return contents;
	}, [messages]);

	const prevCitationsCount = useRef(0);

	useEffect(() => {
		const currentCount = citations?.length || 0;
		if (currentCount > prevCitationsCount.current) {
			setIsDocumentPanelOpen(true);
		}
		prevCitationsCount.current = currentCount;
	}, [citations?.length]);

	const routeData = useMemo(() => {
		const routeTool = currentTools.find((tool) => {
			const name = tool.name.toLowerCase();
			return (name.includes("route") || name.includes("find") || name.includes("map")) && tool.status === "done";
		});

		if (routeTool?.content) {
			try {
				const parsed = JSON.parse(routeTool.content);
				if (parsed.type === "route") {
					return parsed;
				}
			} catch {
				// Not JSON
			}
		}
		return null;
	}, [currentTools]);

	useEffect(() => {
		if (error) {
			toast.error("Đã xảy ra lỗi", {
				description: error,
				duration: 5000,
			});
		}
	}, [error]);

	useEffect(() => {
		sendMessageRef.current = sendMessage;
	}, [sendMessage]);

	useEffect(() => {
		if (isReadOnly) {
			return;
		}

		if (urlMessage && !hasAppended.current && model && agent && threadId) {
			hasAppended.current = true;
			sendMessageRef.current?.(urlMessage, urlQueryMode || undefined);

			setTimeout(() => {
				router.replace(`/chat?thread_id=${threadId}`);
			}, 100);
		}
	}, [urlMessage, urlQueryMode, model, agent, threadId, urlThreadId, router, isReadOnly]);



	const voice = useVoice({
		agentId: agent || "chatbot",
		model,
		threadId: urlThreadId || undefined,
		userId: getUserId() || undefined,
		createThread: async () => {
			return crypto.randomUUID();
		},
		onTranscript: (text) => {
			if (text.trim()) {
				const capitalize = (s: string) =>
					s.toLowerCase().replace(/(^\w|\.\s*\w)/g, (c) => c.toUpperCase());
				addUserMessage(capitalize(text));
				setIsDocumentPanelOpen(false);
			}
		},
		onBotOutput: (text, runId) => {
			if (text.trim()) {
				appendBotMessage(text, runId);
			}
		},
		onToolStarted: (toolCalls) => {
			toolCalls.forEach((tool) => {
				addVoiceToolCall(tool);
			});
		},
		onToolResult: (result) => {
			updateVoiceToolResult(result.toolCallId, result.content);
		},
		onError: (err) => {
			console.error("Voice error:", err);
			toast.error("Lỗi Voice", {
				description: err,
				duration: 5000,
			});
		},
	});

	const handleVoiceStateChange = () => {
		if (voice.state === "connected") {
			voice.stopConversation();
		} else if (voice.state === "idle" || voice.state === "disconnected" || voice.state === "error") {
			// If we already have a threadId, just start conversation instead of redirecting
			if (threadId) {
				voice.startConversation();
			} else {
				onVoiceToggle();
			}
		}
	};

	const handleSendMessage = (message: string, queryMode?: QueryMode) => {
		setIsDocumentPanelOpen(false);
		if (voice.state === "connected") {
			addUserMessage(message);
			voice.sendTextMessage(message);
		} else {
			sendMessage(message, queryMode);
		}
	};

	useEffect(() => {
		if (voice.state === "connected" && !voiceStarted.current) {
			voiceStarted.current = true;
			if (authService.isAuthenticated()) {
				onConversationStart?.();
			}
		}
	}, [voice.state]);

	useEffect(() => {
		if (isReadOnly) {
			return;
		}

		if (shouldStartVoice && !voiceStarted.current && voice.state === "idle") {
			voiceStarted.current = true;
			voice.startConversation();
		}
	}, [shouldStartVoice, voice.state, isReadOnly]);

	useEffect(() => {
		if (voice.state === "connected") {
			console.log(`[Voice] Agent switched to: ${agent}`);
		}
	}, [agent, voice.state]);

	return (
		<>
			<div className="h-[calc(100vh-150px)] w-screen overflow-hidden">
				{isReadOnly && (
					<div className="mx-auto mt-3 w-full max-w-4xl rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
						Đang xem lại hội thoại ở chế độ chỉ đọc.
					</div>
				)}
				<ResizablePanelGroup orientation="horizontal" className="h-full w-full">
					{state === "collapsed" ? null : (
						<>
							<ResizablePanel defaultSize={16} minSize={16} maxSize={16}>
								<div className="h-full" />
							</ResizablePanel>
							<ResizableHandle className="hidden" />
						</>
					)}
					<ResizablePanel defaultSize={isDocumentPanelOpen ? 50 : 100}>
						<div className="h-full flex flex-col bg-background">
							<div className="flex-1 overflow-auto">
								<div className="w-full max-w-4xl mx-auto py-4">
									<ChatWindow
										messages={messages}
										error={error}
										isStreaming={isLoading}
										isHistoryLoading={isHistoryLoading}
										isTyping={isTyping}
										isVoiceMode={voice.state === "connected"}
									isListening={voice.isListening}
									isSpeaking={voice.isSpeaking}
									micLevel={voice.micLevel}
										currentTools={currentTools}
										partialText={voice.partialText}
										threadId={threadId}
										agentId={agent || "chatbot"}
										lastRunId={voice.lastRunId || undefined}
										voiceThreadId={voice.threadId || undefined}
										voiceState={voice.state}
										readOnly={isReadOnly}
										sendMessage={handleSendMessage}
									/>
								</div>
							</div>
						</div>
					</ResizablePanel>
					{isDocumentPanelOpen && (
						<>
							<ResizableHandle withHandle />
							<ResizablePanel defaultSize={50}>
								<DocumentPanel onClose={() => setIsDocumentPanelOpen(false)} citations={citations} routeData={routeData} toolChunks={toolChunks} />
							</ResizablePanel>
						</>
					)}
				</ResizablePanelGroup>
			</div>
			{!isReadOnly && (
				<div
					className={`fixed bottom-0 bg-background px-4 pb-4 pt-6 transition-all duration-300 ${isMobile || state === "collapsed" ? "left-0" : "left-64"} right-0`}
				>
					<div className="mx-auto w-full max-w-4xl flex flex-col gap-2">
						<ChatInput
							isLoading={isLoading}
							onSubmitMessage={handleSendMessage}
							voiceAgentId={agent || "chatbot"}
							voiceModel={model}
							voiceState={voice.state}
							isListening={voice.isListening}
							isSpeaking={voice.isSpeaking}
							isMuted={voice.isMuted}
							onVoiceToggle={handleVoiceStateChange}
							onVoiceMute={voice.toggleMute}
							onSendVoiceTextMessage={voice.sendTextMessage}
							showDocumentButton={true}
							onDocumentToggle={() => setIsDocumentPanelOpen(!isDocumentPanelOpen)}
							defaultQueryMode={urlQueryMode || undefined}
							hasRouteData={!!latestRouteData}
							hasLandmarkData={!!latestLandmarkData}
							onShowRoute={() => setShowRouteModal(true)}
							onShowLandmarks={() => setShowLandmarkModal(true)}
						/>
						<footer className="w-full text-center text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">
							<p>Hệ thống sử dụng AI để hỗ trợ tra cứu. Vui lòng kiểm tra lại văn bản gốc trước khi áp{"\u00a0"}dụng.</p>
						</footer>
					</div>
				</div>
			)}

			<CustomModal
				isOpen={showRouteModal}
				onClose={() => setShowRouteModal(false)}
				title="Bản đồ chỉ đường"
				description="Bản đồ chỉ đường chi tiết giữa hai địa điểm"
				size="xl"
			>
				<div className="h-[60vh] min-h-[400px] overflow-hidden rounded-lg border border-slate-200">
					{latestRouteData && <MiniNavigation routeData={latestRouteData} />}
				</div>
			</CustomModal>

			<CustomModal
				isOpen={showLandmarkModal}
				onClose={() => setShowLandmarkModal(false)}
				title="Hình ảnh địa điểm gợi ý"
				description="Chọn hình ảnh địa điểm bạn nhận diện được để tiếp tục hướng dẫn"
				size="md"
			>
				<div className="min-h-[300px] overflow-y-auto">
					{latestLandmarkData && (
						<LandmarkCarousel
							landmarks={latestLandmarkData}
							disabled={false}
							onConfirm={(landmark) => {
								handleSendMessage(`Tôi đang ở ${landmark.name}`);
								setShowLandmarkModal(false);
							}}
						/>
					)}
				</div>
			</CustomModal>
		</>
	);
}

export default function ChatPage() {
	const router = useRouter();
	const refreshHistory = useAppStore((s) => s.refreshHistory);

	const handleVoiceToggle = () => {
		const threadId = crypto.randomUUID();
		const params = new URLSearchParams({ thread_id: threadId, voice: "true" });
		router.push(`/chat?${params.toString()}`);
	};

	const handleConversationStart = () => {
		refreshHistory();
	};

	return (
		<Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
			<ChatContent onVoiceToggle={handleVoiceToggle} onConversationStart={handleConversationStart} />
		</Suspense>
	);
}
