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
	type: "token" | "message" | "error" | "done";
	content?: string;
}

export class AgentClientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentClientError";
	}
}

const API_BASE = "";

class AgentClient {
	async getInfo(): Promise<ServiceInfo> {
		const response = await fetch(`${API_BASE}/api/agent/info`);

		if (!response.ok) {
			throw new AgentClientError(`Failed to get info: ${response.status}`);
		}

		return response.json();
	}

	async getHistory(threadId: string): Promise<ChatHistory> {
		const response = await fetch(`${API_BASE}/api/agent/history`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ thread_id: threadId }),
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
		} = {}
	): AsyncGenerator<StreamChunk, void, unknown> {
		const { model, agent = "chatbot", threadId, streamTokens = true } = options;

		const requestBody: Record<string, unknown> = {
			message,
			stream_tokens: streamTokens,
		};

		if (threadId) requestBody.thread_id = threadId;
		if (model) requestBody.model = model;
		requestBody.agent = agent;

		const response = await fetch(`${API_BASE}/api/agent/stream`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(requestBody),
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
						if (parsed.type === "message" && typeof parsed.content === "object" && parsed.content !== null) {
							yield {
								type: "message" as const,
								content: parsed.content.content ?? JSON.stringify(parsed.content),
							};
						} else {
							yield {
								type: parsed.type as StreamChunk["type"],
								content: parsed.content ?? parsed.content?.content,
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
