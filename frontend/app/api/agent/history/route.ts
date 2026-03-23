import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
	const userId = request.headers.get("X-User-Id") || "dev-user-123";

	try {
		const body = await request.json();
		const { thread_id } = body;

		if (!thread_id) {
			return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
		}

		const response = await fetch(`${BACKEND_BASE_URL}/history`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-User-Id": userId,
			},
			body: JSON.stringify({ thread_id }),
		});

		if (!response.ok) {
			return NextResponse.json({ error: "Failed to fetch history" }, { status: response.status });
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (error) {
		return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
	}
}
