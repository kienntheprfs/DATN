"use client";

import { useState, useCallback, useRef } from "react";
import { agentClient, ChatMessage } from "@/services/agent";

interface UseChatOptions {
	model?: string;
	agent?: string;
	threadId?: string;
}

interface ToolCall {
	id: string;
	name: string;
	status: "executing" | "done";
	content: string | null;
}

interface MessageChunk {
	type: "message";
	msgType: string;
	toolCalls?: Array<{ id: string; name: string }>;
	toolCallId?: string;
	content: string;
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
	currentTools: ToolCall[];
	error: string | null;
	threadId: string;
}

interface BackendMessage {
	type: "human" | "ai" | "tool";
	content: string;
	tool_calls?: Array<{
		name: string;
		args: Record<string, unknown>;
		id: string;
	}>;
	tool_call_id?: string;
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
	const { model, agent = "chatbot", threadId: initialThreadId } = options;

	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isTyping, setIsTyping] = useState(false);
	const [currentTools, setCurrentTools] = useState<ToolCall[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [threadId] = useState(() => initialThreadId || crypto.randomUUID());

	const abortControllerRef = useRef<AbortController | null>(null);
	const processingRef = useRef(false);
	const toolContentRef = useRef<string | null>(null);
	const toolTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

			if (toolTimeoutRef.current) {
				clearTimeout(toolTimeoutRef.current);
				toolTimeoutRef.current = null;
			}

			processingRef.current = true;
			abortControllerRef.current = new AbortController();
			setIsLoading(true);
			setError(null);
			setCurrentTools([]);

			const userMsg: ChatMessage = {
				id: `user-${Date.now()}`,
				role: "user",
				content: message,
			};

			setMessages((prev) => [...prev, userMsg]);

			const assistantMsgId = `assistant-${Date.now()}`;

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
						const tokenContent = chunk.content;
						setMessages((prev) => {
							const existing = prev.find((m) => m.id === assistantMsgId);
							if (existing) {
								return prev.map((m) =>
									m.id === assistantMsgId
										? { ...m, content: (m.content || "") + tokenContent }
										: m
								);
							}
							return [...prev, { id: assistantMsgId, role: "assistant", content: tokenContent }];
						});
					} else if (chunk.type === "message") {
						const msgChunk = chunk as MessageChunk;
						const msgType = msgChunk.msgType;
						const toolCalls = msgChunk.toolCalls;
						const toolCallId = msgChunk.toolCallId;
						const content = msgChunk.content;

						if (msgType === "tool") {
							const toolId = toolCallId || `tool-${Date.now()}`;
							setCurrentTools((prev) =>
								prev.map((t) =>
									t.id === toolId
										? { ...t, status: "done", content }
										: t
								)
							);
							continue;
						}

						if (msgType === "ai" && toolCalls && toolCalls.length > 0) {
							setIsTyping(false);
							const newTools: ToolCall[] = toolCalls.map((tool) => ({
								id: tool.id,
								name: tool.name,
								status: "executing" as const,
								content: null,
							}));
							setCurrentTools((prev) => [...prev, ...newTools]);
							continue;
						}

						if (content) {
							setMessages((prev) => {
								const existing = prev.find((m) => m.id === assistantMsgId);
								if (existing) {
									return prev.map((m) =>
										m.id === assistantMsgId
											? { ...m, content: content }
											: m
									);
								}
								return [...prev, { id: assistantMsgId, role: "assistant", content: content }];
							});
						}
						break;
					} else if (chunk.type === "error") {
						setError(chunk.content || "Unknown error");
						setCurrentTools([]);
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
		currentTools,
		error,
		threadId,
	};
}
