"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useAgent } from "@/contexts/agent-context";
import { useVoice } from "@/hooks/use-voice";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatInput } from "@/components/page.chatinput";

function ChatContent({ onVoiceToggle }: { onVoiceToggle: () => void }) {
	const searchParams = useSearchParams();
	const initialQuery = searchParams.get("q");
	const shouldStartVoice = searchParams.get("voice") === "true";
	const hasAppended = useRef(false);
	const voiceStarted = useRef(false);
	const { model, agent } = useAgent();

	const { messages, sendMessage, addUserMessage, addBotMessage, updateLastBotMessage, stop, isLoading, isTyping, currentTools, error } = useChat({
		model: model || "gpt-5-nano",
		agent: agent || "chatbot",
	});

	const voice = useVoice({
		voiceServerUrl: "http://localhost:7860",
		agentId: agent || "chatbot",
		model,
		onTranscript: (text) => {
			if (text.trim()) {
				addUserMessage(text);
			}
		},
		onBotOutput: (text) => {
			if (text.trim()) {
				addBotMessage(text);
			}
		},
		onError: (err) => console.error("Voice error:", err),
	});

	const handleVoiceStateChange = () => {
		if (voice.state === "connected") {
			voice.stopConversation();
		} else if (voice.state === "idle" || voice.state === "disconnected" || voice.state === "error") {
			onVoiceToggle();
		}
	};

	useEffect(() => {
		if (voice.state === "connected" && !voiceStarted.current) {
			voiceStarted.current = true;
		}
	}, [voice.state]);

	useEffect(() => {
		if (initialQuery && !hasAppended.current && model && agent) {
			hasAppended.current = true;
			sendMessage(initialQuery);
		}
	}, [initialQuery, sendMessage, model, agent]);

	useEffect(() => {
		if (shouldStartVoice && !voiceStarted.current && voice.state === "idle") {
			voiceStarted.current = true;
			voice.startConversation();
		}
	}, [shouldStartVoice, voice.state]);

	return (
		<div className="flex flex-1 flex-col overflow-hidden bg-background">
			<ChatWindow 
				messages={messages} 
				error={error} 
				isStreaming={isLoading} 
				isTyping={isTyping}
				isVoiceMode={voice.state === "connected"}
				isListening={voice.isListening}
				currentTools={currentTools}
				partialText={voice.partialText}
			/>

			<div className="shrink-0 border-t border-border bg-background p-4">
				<div className="mx-auto w-full max-w-4xl">
					<ChatInput
						isLoading={isLoading}
						onSubmitMessage={sendMessage}
						voiceServerUrl="http://localhost:7860"
						voiceAgentId={agent || "chatbot"}
						voiceModel={model}
						voiceState={voice.state}
						isListening={voice.isListening}
						isSpeaking={voice.isSpeaking}
						isMuted={voice.isMuted}
						onVoiceToggle={handleVoiceStateChange}
						onVoiceMute={voice.toggleMute}
					/>
				</div>
			</div>
		</div>
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
