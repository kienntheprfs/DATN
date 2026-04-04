import { apiClient, getAuthHeaders } from './auth-api';

export interface ServiceInfo {
	models: string[];
	agents: Array<{ key: string; description: string }>;
	default_agent: string;
	default_model: string;
}

export interface ChatMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	createdAt?: string;
	run_id?: string;
}

interface BackendChatMessage {
	id?: string;
	type: "human" | "ai" | "tool";
	content: string;
	run_id?: string;
}

export interface ChatHistory {
	messages: BackendChatMessage[];
}

export interface StreamChunk {
	type: string;
	content?: string;
	msgType?: "ai" | "tool" | "human";
	toolCalls?: Array<{
		id: string;
		name: string;
		args: Record<string, unknown>;
	}>;
	toolCallId?: string;
	raw?: unknown;
	run_id?: string;
}

export class AgentClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentClientError";
	}
}

export const agentClient = {
	async getInfo(): Promise<ServiceInfo> {
		const response = await apiClient.get<ServiceInfo>('/agent/info');
		return response.data;
	},

	async getHistory(threadId: string): Promise<ChatHistory> {
		const response = await apiClient.get<ChatHistory>(`/agent/history/${threadId}`);
		return response.data;
	},

	async *stream(
		message: string,
		options: {
			model?: string;
			agent?: string;
			threadId?: string;
			streamTokens?: boolean;
			queryMode?: "normal" | "deep";
		} = {},
		signal?: AbortSignal
	): AsyncGenerator<StreamChunk, void, unknown> {
		const { model, agent = "chatbot", threadId, streamTokens = true, queryMode = "normal" } = options;

		const requestBody: Record<string, unknown> = {
			message,
			stream_tokens: streamTokens,
			query_mode: queryMode,
		};

		if (threadId) requestBody.thread_id = threadId;
		if (model) requestBody.model = model;
		requestBody.agent = agent;

		const authHeaders = getAuthHeaders();
		const response = await fetch(`/api/agent/stream?agent_id=${agent}`, {
			method: "POST",
			headers: {
				...authHeaders,
			},
			body: JSON.stringify(requestBody),
			signal,
		});

		if (!response.ok) {
			const error = await response.text();
			yield { type: "error", content: error };
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			yield { type: "error", content: "No response body" };
			return;
		}

		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value, { stream: true });
				buffer += chunk;

				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					const trimmedLine = line.trim();
					if (!trimmedLine.startsWith("data: ")) continue;

					const data = trimmedLine.slice(6);
					if (data === "[DONE]") {
						yield { type: "done" };
						return;
					}

					try {
						const parsed = JSON.parse(data);
						
						if (parsed.type === "message" && parsed.content && typeof parsed.content === "object") {
							const content = parsed.content;
							if (content.type === "ai" || content.type === "tool") {
								yield {
									type: "message" as const,
									msgType: content.type,
									content: content.content || "",
									toolCalls: content.tool_calls || null,
									toolCallId: content.tool_call_id || null,
									run_id: content.run_id || null,
								};
							} else {
								yield {
									type: "message" as const,
									content: JSON.stringify(content),
								};
							}
						} else if (parsed.type === "token") {
							yield {
								type: "token" as const,
								content: parsed.content,
							};
						} else if (parsed.type === "error") {
							yield {
								type: "error" as const,
								content: parsed.content,
							};
						} else {
							yield {
								type: "unknown" as const,
								raw: parsed,
							};
						}
					} catch {
						// Skip malformed JSON
					}
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
};

export default agentClient;
