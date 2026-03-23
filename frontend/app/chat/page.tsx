"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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

	const [isReady, setIsReady] = useState(false);
	const [currentAgent, setCurrentAgent] = useState("chatbot");
	const [currentModel, setCurrentModel] = useState("gpt-5-nano");

	useEffect(() => {
		if (agent && model) {
			setCurrentAgent(agent);
			setCurrentModel(model);
			setIsReady(true);
		}
	}, [agent, model]);

	const { messages, sendMessage, isLoading, error } = useChat({
		model: currentModel,
		agent: currentAgent,
	});

	useEffect(() => {
		if (initialQuery && !hasAppended.current && isReady) {
			hasAppended.current = true;
			sendMessage(initialQuery);
		}
	}, [initialQuery, sendMessage, isReady]);

	return (
		<div className="flex h-screen w-full flex-col bg-background">
			<ChatWindow messages={messages} error={error} />

			<div className="border-t border-border bg-background p-4">
				<div className="mx-auto w-full max-w-4xl">
					<ChatInput isLoading={isLoading} onSubmitMessage={sendMessage} />
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
