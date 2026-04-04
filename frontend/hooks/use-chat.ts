"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { agentClient, ChatMessage } from "@/services/agent";

interface UseChatOptions {
	model?: string;
	agent?: string;
	threadId?: string;
	initialMessages?: ChatMessage[];
	initialMessage?: string;
	initialQueryMode?: "normal" | "deep";
	onThreadIdGenerated?: (threadId: string) => void;
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
	run_id?: string;
}

interface UseChatReturn {
	messages: ChatMessage[];
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	sendMessage: (message: string, queryMode?: "normal" | "deep") => Promise<void>;
	addUserMessage: (content: string) => string;
	addBotMessage: (content: string) => string;
	appendBotMessage: (content: string, runId?: string) => void;
	updateLastBotMessage: (content: string) => void;
	addVoiceToolCall: (tool: { id: string; name: string; args?: Record<string, unknown> }) => void;
	updateVoiceToolResult: (toolCallId: string, content: string) => void;
	clearVoiceTools: () => void;
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
	const { model, agent = "chatbot", threadId: initialThreadId, initialMessages = [], initialMessage, initialQueryMode, onThreadIdGenerated } = options;

	const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
	const [isLoading, setIsLoading] = useState(false);
	const [isTyping, setIsTyping] = useState(false);
	const [currentTools, setCurrentTools] = useState<ToolCall[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [threadId, setThreadId] = useState<string>(() => initialThreadId || "");

	const abortControllerRef = useRef<AbortController | null>(null);
	const processingRef = useRef(false);
	const toolContentRef = useRef<string | null>(null);
	const toolTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const currentRunIdRef = useRef<string | null>(null);
	const threadIdGeneratedRef = useRef(false);
	const hasInitializedRef = useRef(false);

	useEffect(() => {
		if (!threadId && !threadIdGeneratedRef.current) {
			const newThreadId = crypto.randomUUID();
			setThreadId(newThreadId);
			threadIdGeneratedRef.current = true;
			onThreadIdGenerated?.(newThreadId);
		}
	}, [threadId, onThreadIdGenerated]);

	useEffect(() => {
		if (hasInitializedRef.current) return;
		hasInitializedRef.current = true;

		if (!initialThreadId) return;

		if (initialMessage) {
			setThreadId(initialThreadId);
			setMessages([]);
			return;
		}

		const loadHistory = async () => {
			try {
				const history = await agentClient.getHistory(initialThreadId);
				if (history.messages && history.messages.length > 0) {
					const formattedMessages: ChatMessage[] = history.messages.map((msg, idx) => ({
						id: msg.id || `msg-${idx}`,
						role: msg.type === "human" ? "user" : "assistant",
						content: msg.content,
						run_id: msg.run_id,
					}));
					setMessages(formattedMessages);
				} else {
					setMessages([]);
				}
				setThreadId(initialThreadId);
			} catch {
				setMessages([]);
				setThreadId(initialThreadId);
			}
		};

		loadHistory();
	}, [initialThreadId, initialMessage]);

	const stop = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
	}, []);

	const sendMessage = useCallback(
		async (message: string, queryMode?: "normal" | "deep") => {
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
					queryMode,
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
						const runId = msgChunk.run_id;

						if (runId) {
							currentRunIdRef.current = runId;
							setMessages((prev) => {
								const existing = prev.find((m) => m.id === assistantMsgId);
								if (existing && !existing.run_id) {
									return prev.map((m) =>
										m.id === assistantMsgId
											? { ...m, run_id: runId ?? undefined }
											: m
									);
								}
								return prev;
							});
						}

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
			if (currentRunIdRef.current) {
				setMessages((prev) => {
					const existing = prev.find((m) => m.id === assistantMsgId);
					if (existing && !existing.run_id) {
						return prev.map((m) =>
							m.id === assistantMsgId
								? { ...m, run_id: currentRunIdRef.current ?? undefined }
								: m
						);
					}
					return prev;
				});
			}
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

	const appendBotMessage = useCallback((content: string, runId?: string) => {
		console.log("[use-chat] appendBotMessage:", content.substring(0, 50), "runId:", runId);
		setMessages((prev) => {
			const lastIdx = prev.length - 1;
			if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
				return prev.map((m, i) => 
					i === lastIdx ? { ...m, content: (m.content || "") + "\n" + content, run_id: runId ?? m.run_id } : m
				);
			}
			// If no assistant message exists, create one
			const id = `assistant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
			return [...prev, { id, role: "assistant", content, run_id: runId }];
		});
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

	const addVoiceToolCall = useCallback((tool: { id: string; name: string; args?: Record<string, unknown> }) => {
		const newTool: ToolCall = {
			id: tool.id,
			name: tool.name,
			status: "executing",
			content: null,
		};
		setCurrentTools((prev) => [...prev, newTool]);
	}, []);

	const updateVoiceToolResult = useCallback((toolCallId: string, content: string) => {
		setCurrentTools((prev) =>
			prev.map((t) =>
				t.id === toolCallId
					? { ...t, status: "done" as const, content }
					: t
			)
		);
	}, []);

	const clearVoiceTools = useCallback(() => {
		setCurrentTools([]);
	}, []);

	return {
		messages,
		setMessages,
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
	};
}
