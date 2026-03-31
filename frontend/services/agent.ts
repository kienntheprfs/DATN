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
}

export interface ChatHistory {
	messages: ChatMessage[];
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
}

export class AgentClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentClientError";
	}
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

class AgentClient {
	async getInfo(): Promise<ServiceInfo> {
		const response = await fetch(`${API_BASE}/agent/info`, {
			headers: getAuthHeaders(),
		});

		if (!response.ok) {
			throw new AgentClientError(`Failed to get info: ${response.status}`);
		}

		return response.json();
	}

	async getHistory(threadId: string): Promise<ChatHistory> {
		const response = await fetch(`${API_BASE}/agent/history/${threadId}`, {
			headers: getAuthHeaders(),
		});

		if (!response.ok) {
			throw new AgentClientError(`Failed to get history: ${response.status}`);
		}

		return response.json();
	}

	async *stream(
		message: string,
		options: {
			model?: string;
			agent?: string;
			threadId?: string;
			streamTokens?: boolean;
		} = {},
		signal?: AbortSignal
	): AsyncGenerator<StreamChunk, void, unknown> {
		const { model, agent = "chatbot", threadId, streamTokens = true } = options;

		const requestBody: Record<string, unknown> = {
			message,
			stream_tokens: streamTokens,
		};

		if (threadId) requestBody.thread_id = threadId;
		if (model) requestBody.model = model;
		requestBody.agent = agent;

		const response = await fetch(`${API_BASE}/agent/stream`, {
			method: "POST",
			headers: getAuthHeaders(),
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
						console.log("Parsed:", parsed);
						
						// Check if content is an object with type field (ChatMessage format)
						if (parsed.type === "message" && parsed.content && typeof parsed.content === "object") {
							const content = parsed.content;
							// content has: type, content (string), tool_calls?, tool_call_id?
							if (content.type === "ai" || content.type === "tool") {
								yield {
									type: "message" as const,
									msgType: content.type,
									content: content.content || "",
									toolCalls: content.tool_calls || null,
									toolCallId: content.tool_call_id || null,
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
}

export const agentClient = new AgentClient();
export default agentClient;
