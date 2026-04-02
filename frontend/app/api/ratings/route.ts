import { NextRequest, NextResponse } from "next/server";
import { ratingService } from "@/services/rating-api";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { run_id, rating, comment, thread_id, agent_id } = body;

		if (!run_id || !rating || !thread_id) {
			return NextResponse.json(
				{ error: "Missing required fields: run_id, rating, thread_id" },
				{ status: 400 }
			);
		}

		const result = await ratingService.createOrUpdate({
			run_id,
			rating,
			comment,
			thread_id,
			agent_id,
		});

		return NextResponse.json(result, { status: 201 });
	} catch (error) {
		console.error("Error creating rating:", error);
		return NextResponse.json(
			{ error: "Failed to create rating" },
			{ status: 500 }
		);
	}
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const threadId = searchParams.get("thread_id");

		if (!threadId) {
			return NextResponse.json(
				{ error: "Missing thread_id parameter" },
				{ status: 400 }
			);
		}

		const ratings = await ratingService.getThreadRatings(threadId);
		return NextResponse.json(ratings);
	} catch (error) {
		console.error("Error fetching ratings:", error);
		return NextResponse.json(
			{ error: "Failed to fetch ratings" },
			{ status: 500 }
		);
	}
}

export async function DELETE(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const ratingId = searchParams.get("id");

		if (!ratingId) {
			return NextResponse.json(
				{ error: "Missing rating id parameter" },
				{ status: 400 }
			);
		}

		await ratingService.deleteRating(ratingId);
		return new NextResponse(null, { status: 204 });
	} catch (error) {
		console.error("Error deleting rating:", error);
		return NextResponse.json(
			{ error: "Failed to delete rating" },
			{ status: 500 }
		);
	}
}
