import { apiClient, refreshAccessToken } from './auth-api';

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

const getUserId = (): string => {
  if (typeof window === "undefined") return "guest";
  const user = localStorage.getItem("user");
  if (user) {
    try {
      const parsed = JSON.parse(user);
      return parsed.id?.toString() || parsed.sub?.toString() || "guest";
    } catch {
      return "guest";
    }
  }
  return "guest";
};

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('access_token');
  const userId = getUserId();
  return {
    'Content-Type': 'application/json',
    'X-User-Id': userId,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const ensureValidToken = async (): Promise<void> => {
  const token = localStorage.getItem('access_token');
  if (token) {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - now;
    
    if (expiresIn < 300) {
      await refreshAccessToken();
    }
  }
};

class AgentClient {
	async getInfo(): Promise<ServiceInfo> {
    await ensureValidToken();
		const response = await fetch(`${API_BASE}/agent/info`, {
			headers: getAuthHeaders(),
		});

		if (!response.ok) {
			throw new AgentClientError(`Failed to get info: ${response.status}`);
		}

		return response.json();
	}

	async getHistory(threadId: string): Promise<ChatHistory> {
    await ensureValidToken();
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
			queryMode?: "normal" | "deep";
		} = {},
		signal?: AbortSignal
	): AsyncGenerator<StreamChunk, void, unknown> {
		const { model, agent = "chatbot", threadId, streamTokens = true, queryMode = "normal" } = options;

    await ensureValidToken();

		const requestBody: Record<string, unknown> = {
			message,
			stream_tokens: streamTokens,
			query_mode: queryMode,
		};

		if (threadId) requestBody.thread_id = threadId;
		if (model) requestBody.model = model;
		requestBody.agent = agent;

		const response = await fetch(`${API_BASE}/agent/stream?agent_id=${agent}`, {
			method: "POST",
			headers: getAuthHeaders(),
			body: JSON.stringify(requestBody),
			signal,
		});

		console.log("Agent stream response:", response);

		if (!response.ok) {
			const error = await response.text();
			console.error("API Error:", response.status, error);
			yield { type: "error", content: error };
			return;
		}

		const reader = response.body?.getReader();
		if (!reader) {
			console.error("No response body");
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
					console.log("Received line:", trimmedLine);
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
