"use client";

import { Suspense, useEffect, useRef, useState, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useAgent } from "@/contexts/agent-context";
import { useVoice } from "@/hooks/use-voice";
import { useSidebar } from "@/components/ui/sidebar";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatInput, QueryMode } from "@/components/page.chatinput";
import { DocumentPanel } from "@/components/chat/document-panel";
import { toast } from "sonner";
import { getUserId } from "@/services/auth-api";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useAppStore } from "@/stores/app.store";

function ChatContent({ onVoiceToggle, onConversationStart }: { onVoiceToggle: () => void; onConversationStart?: () => void }) {
	const searchParams = useSearchParams();
	const urlThreadId = searchParams.get("thread_id");
	const urlMessage = searchParams.get("message");
	const urlQueryMode = searchParams.get("query_mode") as QueryMode | null;
	const shouldStartVoice = searchParams.get("voice") === "true";
	const hasAppended = useRef(false);
	const voiceStarted = useRef(false);
	const sendMessageRef = useRef<((message: string, queryMode?: QueryMode) => Promise<void>) | null>(null);
	const router = useRouter();
	const { model, agent } = useAgent();
	const { state } = useSidebar();
	const [isDocumentPanelOpen, setIsDocumentPanelOpen] = useState(false);

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
		clearVoiceTools,
		stop,
		isLoading,
		isTyping,
		currentTools,
		error,
		threadId,
	} = useChat({
		model: model || "gpt-5-nano",
		agent: agent || "chatbot",
		threadId: urlThreadId || undefined,
		initialMessage: urlMessage || undefined,
		initialQueryMode: urlQueryMode || undefined,
		key: chatKey,
	});

	const citations = useMemo(() => {
		const allCitations: Array<{ file_name: string; s3_url: string; text_preview: string; source_type: string }> = [];
		messages.forEach((msg) => {
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
		if (urlMessage && !hasAppended.current && model && agent && threadId) {
			hasAppended.current = true;
			sendMessageRef.current?.(urlMessage, urlQueryMode || undefined);

			setTimeout(() => {
				router.replace(`/chat?thread_id=${urlThreadId}`);
			}, 100);
		}
	}, [urlMessage, urlQueryMode, model, agent, threadId, urlThreadId, router]);

	useEffect(() => {
		if (routeData && !isDocumentPanelOpen) {
			setIsDocumentPanelOpen(true);
		}
	}, [routeData]);

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
				addUserMessage(text);
				clearVoiceTools();
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
			onVoiceToggle();
		}
	};

	const handleSendMessage = (message: string, queryMode?: QueryMode) => {
		sendMessage(message, queryMode);
	};

	useEffect(() => {
		if (voice.state === "connected" && !voiceStarted.current) {
			voiceStarted.current = true;
			onConversationStart?.();
		}
	}, [voice.state]);

	useEffect(() => {
		if (shouldStartVoice && !voiceStarted.current && voice.state === "idle") {
			voiceStarted.current = true;
			voice.startConversation();
		}
	}, [shouldStartVoice, voice.state]);

	return (
		<>
			<div className="h-[calc(100vh-100px)] w-screen overflow-hidden">
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
										isTyping={isTyping}
										isVoiceMode={voice.state === "connected"}
										isListening={voice.isListening}
										currentTools={currentTools}
										partialText={voice.partialText}
										threadId={threadId}
										agentId={agent || "chatbot"}
										lastRunId={voice.lastRunId || undefined}
										voiceThreadId={voice.threadId || undefined}
										voiceState={voice.state}
									/>
								</div>
							</div>
						</div>
					</ResizablePanel>
					{isDocumentPanelOpen && (
						<>
							<ResizableHandle withHandle />
							<ResizablePanel defaultSize={50}>
								<DocumentPanel onClose={() => setIsDocumentPanelOpen(false)} citations={citations} routeData={routeData} />
							</ResizablePanel>
						</>
					)}
				</ResizablePanelGroup>
			</div>
			<div
				className={`fixed bottom-0 border-t border-border bg-background p-4 transition-all duration-300 ${state === "collapsed" ? "left-0" : "left-64"} right-0`}
			>
				<div className="mx-auto w-full max-w-4xl">
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
						showDocumentButton={true}
						onDocumentToggle={() => setIsDocumentPanelOpen(!isDocumentPanelOpen)}
					/>
				</div>
			</div>{" "}
		</>
	);
}

export default function ChatPage() {
	const router = useRouter();
	const refreshHistory = useAppStore((s) => s.refreshHistory);

	const handleVoiceToggle = () => {
		const threadId = crypto.randomUUID();
		const params = new URLSearchParams({ thread_id: threadId, voice: "true" });
		router.replace(`/chat?${params.toString()}`);
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
