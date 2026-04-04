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

function ChatContent({ onVoiceToggle }: { onVoiceToggle: () => void }) {
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

	const { messages, sendMessage, addUserMessage, addBotMessage, appendBotMessage, updateLastBotMessage, addVoiceToolCall, updateVoiceToolResult, clearVoiceTools, stop, isLoading, isTyping, currentTools, error, threadId } = useChat({
		model: model || "gpt-5-nano",
		agent: agent || "chatbot",
		threadId: urlThreadId || undefined,
		initialMessage: urlMessage || undefined,
		initialQueryMode: urlQueryMode || undefined,
		key: chatKey,
	});

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

	const voice = useVoice({
		agentId: agent || "chatbot",
		model,
		threadId: threadId,
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
			<div className="flex flex-1 flex-col overflow-hidden bg-background pb-32">
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
			<div className={`fixed bottom-0 border-t border-border bg-background p-4 transition-all duration-300 ${state === "collapsed" ? "left-0" : "left-64"} right-0`}>
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
			</div>
			<DocumentPanel 
				isOpen={isDocumentPanelOpen} 
				onClose={() => setIsDocumentPanelOpen(false)} 
			/>
		</>
	);
}

export default function ChatPage() {
	const [conversationKey, setConversationKey] = useState(0);
	const voiceRef = useRef<{ startConversation: () => void } | null>(null);

	const handleVoiceToggle = () => {
		setConversationKey((k) => k + 1);
	};

	return (
		<Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
			<ChatContent 
				key={conversationKey}
				onVoiceToggle={handleVoiceToggle}
			/>
		</Suspense>
	);
}
