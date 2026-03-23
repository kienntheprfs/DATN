"use client";

import { useState, useCallback, useRef } from "react";
import { agentClient, ChatMessage } from "@/services/agent";

interface UseChatOptions {
	model?: string;
	agent?: string;
	threadId?: string;
}

interface UseChatReturn {
	messages: ChatMessage[];
	sendMessage: (message: string) => Promise<void>;
	stop: () => void;
	isLoading: boolean;
	error: string | null;
	threadId: string;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
	const { model, agent = "chatbot", threadId: initialThreadId } = options;

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [threadId] = useState(() => initialThreadId || crypto.randomUUID());

	const abortControllerRef = useRef<AbortController | null>(null);
	const processingRef = useRef(false);

	const stop = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
	}, []);

	const sendMessage = useCallback(
		async (message: string) => {
			if (processingRef.current) {
				if (abortControllerRef.current) {
					abortControllerRef.current.abort();
				}
			}

			processingRef.current = true;
			abortControllerRef.current = new AbortController();
			setIsLoading(true);
			setError(null);

			const userMsg: ChatMessage = {
				id: `user-${Date.now()}`,
				role: "user",
				content: message,
			};

			setMessages((prev) => [...prev, userMsg]);

			const assistantMsgId = `assistant-${Date.now()}`;
			let fullResponse = "";

			setMessages((prev) => [...prev, { id: assistantMsgId, role: "assistant", content: "" }]);

			try {
				for await (const chunk of agentClient.stream(message, {
					model,
					agent,
					threadId: threadId,
					streamTokens: true,
				}, abortControllerRef.current.signal)) {
					if (abortControllerRef.current?.signal.aborted) {
						break;
					}

					if (chunk.type === "token" && chunk.content) {
						fullResponse += chunk.content;
						setMessages((prev) =>
							prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullResponse } : m))
						);
					} else if (chunk.type === "message" && chunk.content) {
						fullResponse = chunk.content;
						setMessages((prev) =>
							prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullResponse } : m))
						);
					} else if (chunk.type === "error") {
						setError(chunk.content || "Unknown error");
					}
				}
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					setError(err.message);
				}
			} finally {
				setIsLoading(false);
				processingRef.current = false;
			}
		},
		[model, agent, threadId]
	);

	return {
		messages,
		sendMessage,
		stop,
		isLoading,
		error,
		threadId,
	};
}
