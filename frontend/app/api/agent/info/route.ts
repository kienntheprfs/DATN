import { NextRequest, NextResponse } from "next/server";

const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_AGENT_BACKEND_URL || "http://localhost:8080";

export async function GET(request: NextRequest) {
	const userId = request.headers.get("X-User-Id") || "dev-user-123";

	try {
		const response = await fetch(`${BACKEND_BASE_URL}/info`, {
			method: "GET",
			headers: {
				"X-User-Id": userId,
			},
		});

		if (!response.ok) {
			return NextResponse.json({ error: "Failed to fetch" }, { status: response.status });
		}

		const data = await response.json();
		return NextResponse.json(data);
	} catch (error) {
		return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
	}
}
