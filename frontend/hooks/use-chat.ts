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
	addUserMessage: (content: string) => string;
	addBotMessage: (content: string) => void;
	updateLastBotMessage: (content: string) => void;
	stop: () => void;
	isLoading: boolean;
	isTyping: boolean;
	error: string | null;
	threadId: string;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
	const { model, agent = "chatbot", threadId: initialThreadId } = options;

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isTyping, setIsTyping] = useState(false);
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
						const completeResponse = typeof chunk.content === "string" ? chunk.content : (chunk.content as any)?.content || "";
						setIsTyping(true);
						
						const words = completeResponse.split(" ");
						for (let i = 0; i <= words.length; i++) {
							if (abortControllerRef.current?.signal.aborted) break;
							fullResponse = words.slice(0, i).join(" ");
							setMessages((prev) =>
								prev.map((m) => (m.id === assistantMsgId ? { ...m, content: fullResponse } : m))
							);
							if (i < words.length) {
								await new Promise(resolve => setTimeout(resolve, 20));
							}
						}
						setIsTyping(false);
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
				setIsTyping(false);
				processingRef.current = false;
			}
		},
		[model, agent, threadId]
	);

	const addUserMessage = useCallback((content: string): string => {
		const id = `user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const msg: ChatMessage = { id, role: "user", content };
		setMessages((prev) => [...prev, msg]);
		return id;
	}, []);

	const addBotMessage = useCallback((content: string): string => {
		const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const msg: ChatMessage = { id, role: "assistant", content };
		setMessages((prev) => [...prev, msg]);
		return id;
	}, []);

	const updateLastBotMessage = useCallback((content: string) => {
		setMessages((prev) => {
			const lastIdx = prev.length - 1;
			if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
				return prev.map((m, i) => i === lastIdx ? { ...m, content } : m);
			}
			return prev;
		});
	}, []);

	return {
		messages,
		sendMessage,
		addUserMessage,
		addBotMessage,
		updateLastBotMessage,
		stop,
		isLoading,
		isTyping,
		error,
		threadId,
	};
}
