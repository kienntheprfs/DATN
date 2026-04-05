"use client";

import React, { useState, useEffect } from "react";
import { ThumbsUp, ThumbsDown, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RatingValue, ratingService } from "@/services/rating-api";
import { apiClient } from "@/services/auth-api";

interface RatingButtonsProps {
	runId: string;
	threadId: string;
	agentId?: string;
}

const DISLIKE_TAGS = [
	{ id: "wrong_info", label: "Thông tin sai" },
	{ id: "unclear", label: "Không rõ ràng" },
	{ id: "incomplete", label: "Chưa đầy đủ" },
	{ id: "too_long", label: "Quá dài" },
	{ id: "irrelevant", label: "Không liên quan" },
	{ id: "other", label: "Khác" },
];

const isAuthenticated = (): boolean => {
	if (typeof window === "undefined") return false;
	return !!localStorage.getItem("access_token");
};

const isValidUUID = (str: string): boolean => {
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	return uuidRegex.test(str);
};

function DislikeDialog({ open, onClose, runId, threadId, agentId, onSubmit }: {
	open: boolean;
	onClose: () => void;
	runId: string;
	threadId: string;
	agentId?: string;
	onSubmit: () => void;
}) {
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [comment, setComment] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleTagToggle = (tagId: string) => {
		setSelectedTags((prev) =>
			prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId]
		);
	};

	const handleSubmit = async () => {
		setIsSubmitting(true);

		const selectedTagLabels = selectedTags
			.map((id) => DISLIKE_TAGS.find((t) => t.id === id)?.label)
			.filter(Boolean)
			.join(", ");

		const fullComment = selectedTagLabels
			? `${selectedTagLabels}${comment ? `. ${comment}` : ""}`
			: comment;

		try {
			await ratingService.createOrUpdate({
				run_id: runId,
				rating: "DISLIKE",
				comment: fullComment || undefined,
				thread_id: threadId,
				agent_id: agentId,
			});
			toast.success("Đã ghi nhận phản hồi");
			onSubmit();
			handleClose();
		} catch (err) {
			console.error("Failed to submit dislike:", err);
			toast.error("Có lỗi xảy ra");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClose = () => {
		onClose();
		setSelectedTags([]);
		setComment("");
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="sm:max-w-106.25">
				<DialogHeader>
					<DialogTitle>Phản hồi về câu trả lời</DialogTitle>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div>
						<span className="text-sm font-medium mb-2 block">Chọn lý do (tùy chọn)</span>
						<div className="flex flex-wrap gap-2">
							{DISLIKE_TAGS.map((tag) => (
								<button
									key={tag.id}
									onClick={() => handleTagToggle(tag.id)}
									className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
										selectedTags.includes(tag.id)
											? "bg-primary text-primary-foreground border-primary"
											: "bg-background border-border hover:border-primary"
									}`}
								>
									{tag.label}
								</button>
							))}
						</div>
					</div>

					<div>
						<span className="text-sm font-medium mb-2 block">Nhận xét thêm</span>
						<textarea
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="Nhập nhận xét của bạn..."
							className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
							rows={3}
						/>
					</div>
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleClose}>
						Hủy
					</Button>
					<Button onClick={handleSubmit} disabled={isSubmitting} className="gap-1.5">
						<Send className="size-4" />
						Gửi phản hồi
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function RatingButtons({ runId, threadId, agentId }: RatingButtonsProps) {
	const [rated, setRated] = useState<RatingValue | null>(null);
	const [ratingId, setRatingId] = useState<string | null>(null);
	const [showDislikeDialog, setShowDislikeDialog] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const isValid = isValidUUID(runId);

	useEffect(() => {
		if (!isValid || !isAuthenticated()) return;

		apiClient.get<Array<{ id: string; run_id: string; rating: RatingValue }>>(`/dashboard/ratings/thread/${threadId}`)
			.then((res) => {
				const ratings = res.data;
				const existingRating = ratings.find((r) => r.run_id === runId);
				if (existingRating) {
					setRated(existingRating.rating);
					setRatingId(existingRating.id);
				}
			})
			.catch(() => {});
	}, [runId, threadId, isValid]);

	if (!isValid) {
		return null;
	}

	const handleUnlike = async () => {
		if (!ratingId) return;
		setIsSubmitting(true);
		try {
		await ratingService.deleteRating(ratingId);
			setRated(null);
			setRatingId(null);
			toast.success("Đã bỏ bình chọn");
		} catch {
			toast.error("Có lỗi xảy ra");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleLike = async () => {
		if (!isAuthenticated()) {
			toast.error("Vui lòng đăng nhập để bình chọn");
			return;
		}

		if (rated === "LIKE") {
			await handleUnlike();
			return;
		}

		setIsSubmitting(true);
		try {
			const result = await ratingService.createOrUpdate({
				run_id: runId,
				rating: "LIKE",
				thread_id: threadId,
				agent_id: agentId,
			});
			setRated("LIKE");
			setRatingId(result.id);
			toast.success("Cảm ơn bạn!");
		} catch (err) {
			console.error("Failed to like:", err);
			toast.error("Có lỗi xảy ra");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDislike = () => {
		if (!isAuthenticated()) {
			toast.error("Vui lòng đăng nhập để bình chọn");
			return;
		}

		if (rated === "DISLIKE") {
			handleUnlike();
			return;
		}

		setShowDislikeDialog(true);
	};

	const handleDislikeSubmit = () => {
		setRated("DISLIKE");
	};

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex items-center gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleLike}
							className={`size-8 rounded-full ${
								rated === "LIKE"
									? "bg-green-100 text-green-600 hover:bg-green-100"
									: "text-muted-foreground hover:text-green-600 hover:bg-green-50"
							}`}
						>
							<ThumbsUp className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{rated === "LIKE" ? "Bỏ like" : "Hữu ích"}
					</TooltipContent>
				</Tooltip>

				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							onClick={handleDislike}
							className={`size-8 rounded-full ${
								rated === "DISLIKE"
									? "bg-orange-100 text-orange-600 hover:bg-orange-100"
									: "text-muted-foreground hover:text-orange-600 hover:bg-orange-50"
							}`}
						>
							<ThumbsDown className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>
						{rated === "DISLIKE" ? "Bỏ dislike" : "Không hữu ích"}
					</TooltipContent>
				</Tooltip>
			</div>

			<DislikeDialog
				open={showDislikeDialog}
				onClose={() => setShowDislikeDialog(false)}
				runId={runId}
				threadId={threadId}
				agentId={agentId}
				onSubmit={handleDislikeSubmit}
			/>
		</TooltipProvider>
	);
}
