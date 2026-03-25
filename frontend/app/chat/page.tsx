"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useChat } from "@/hooks/use-chat";
import { useAgent } from "@/contexts/agent-context";
import { ChatWindow } from "@/components/chat/chat-window";
import { ChatInput } from "@/components/page.chatinput";

function ChatContent() {
	const searchParams = useSearchParams();
	const initialQuery = searchParams.get("q");
	const hasAppended = useRef(false);
	const { model, agent } = useAgent();

	const { messages, sendMessage, stop, isLoading, error } = useChat({
		model: model || "gpt-5-nano",
		agent: agent || "chatbot",
	});

	const handleVoiceTranscript = (text: string) => {
		if (text.trim()) {
			sendMessage(text);
		}
	};

	useEffect(() => {
		if (initialQuery && !hasAppended.current && model && agent) {
			hasAppended.current = true;
			sendMessage(initialQuery);
		}
	}, [initialQuery, sendMessage, model, agent]);

	return (
		<div className="flex h-screen w-full flex-col bg-background">
			<ChatWindow messages={messages} error={error} isStreaming={isLoading} onStop={stop} />

			<div className="border-t border-border bg-background p-4">
				<div className="mx-auto w-full max-w-4xl">
					<ChatInput
						isLoading={isLoading}
						onSubmitMessage={sendMessage}
						voiceServerUrl="http://localhost:7860"
						voiceAgentId={agent || "chatbot"}
						voiceModel={model}
						onVoiceTranscript={handleVoiceTranscript}
					/>
				</div>
			</div>
		</div>
	);
}

export default function ChatPage() {
	return (
		<Suspense fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}>
			<ChatContent />
		</Suspense>
	);
}
