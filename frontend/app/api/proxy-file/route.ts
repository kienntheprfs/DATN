import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	const { url } = await request.json();

	if (!url) {
		return NextResponse.json({ error: "Missing url" }, { status: 400 });
	}

	try {
		const response = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
			},
		});

		if (!response.ok) {
			return NextResponse.json({ error: "Failed to fetch file" }, { status: response.status });
		}

		const contentType = response.headers.get("content-type") || "";
		const isPdf = contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
		const isText = contentType.includes("text/") || 
			url.toLowerCase().endsWith(".txt") || 
			url.toLowerCase().endsWith(".md") ||
			url.toLowerCase().endsWith(".markdown");

		if (isPdf) {
			const arrayBuffer = await response.arrayBuffer();
			const base64 = Buffer.from(arrayBuffer).toString("base64");
			return NextResponse.json({ 
				isPdf: true, 
				content: base64,
				contentType: "application/pdf",
			});
		}

		if (isText) {
			const text = await response.text();
			return NextResponse.json({ 
				isPdf: false, 
				content: text,
				contentType: "text/plain",
			});
		}

		return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
	} catch (error) {
		return NextResponse.json({ error: "Failed to fetch file" }, { status: 500 });
	}
}