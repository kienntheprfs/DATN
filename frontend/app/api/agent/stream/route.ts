import { NextRequest } from "next/server";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
	const encoder = new TextEncoder();

	try {
		const body = await request.json();
		const { message, model, agent = "chatbot", thread_id, stream_tokens = true } = body;

		if (!message) {
			return new Response(JSON.stringify({ error: "Message is required" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			});
		}

		const userId = request.headers.get("X-User-Id") || "dev-user-123";

		const response = await fetch(`${BACKEND_BASE_URL}/${agent}/stream`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-User-Id": userId,
			},
			body: JSON.stringify({
				message,
				model,
				thread_id,
				stream_tokens,
			}),
		});

		if (!response.ok) {
			const error = await response.text();
			return new Response(JSON.stringify({ error }), {
				status: response.status,
				headers: { "Content-Type": "application/json" },
			});
		}

		const backendStream = response.body;
		if (!backendStream) {
			return new Response("Internal server error", { status: 500 });
		}

		const readable = new ReadableStream({
			async start(controller) {
				const reader = backendStream.getReader();
				let buffer = "";

				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						const chunk = new TextDecoder().decode(value, { stream: true });
						buffer += chunk;

						const lines = buffer.split("\n");
						buffer = lines.pop() || "";

						for (const line of lines) {
							const trimmedLine = line.trim();
							if (!trimmedLine.startsWith("data: ")) continue;

							const data = trimmedLine.slice(6);
							if (data === "[DONE]") {
								controller.close();
								return;
							}

							try {
								const parsed = JSON.parse(data);
								if (parsed.type === "token" || parsed.type === "message" || parsed.type === "error") {
									controller.enqueue(encoder.encode(`data: ${JSON.stringify(parsed)}\n`));
								}
							} catch {
								// Skip malformed JSON
							}
						}
					}
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});

		return new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Chat stream error:", error);
		return new Response(JSON.stringify({ error: "Internal server error" }), {
			status: 500,
			headers: { "Content-Type": "application/json" },
		});
	}
}
