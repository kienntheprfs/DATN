import { apiClient } from './auth-api';

export type RatingValue = 'LIKE' | 'DISLIKE';

export interface RatingCreate {
	run_id: string;
	rating: RatingValue;
	comment?: string;
	thread_id: string;
	agent_id?: string;
}

export interface RatingResponse {
	id: string;
	user_id: string;
	run_id: string;
	rating: RatingValue;
	comment: string | null;
	thread_id: string;
	agent_id: string | null;
	created_at: string;
	updated_at: string;
}

export interface DailyRatingStat {
	date: string;
	like_count: number;
	dislike_count: number;
}

export interface DislikeReasonStat {
	reason: string;
	count: number;
}

export interface AdminRatingStatsResponse {
	total: number;
	like_count: number;
	dislike_count: number;
	like_percentage: number;
	daily_stats: DailyRatingStat[];
	dislike_reasons: DislikeReasonStat[];
}

export interface AdminRatingStatsParams {
	search?: string;
	from_date?: string;
	to_date?: string;
}

export interface AdminRatingListParams {
	page: number;
	page_size: number;
	search?: string;
	rating?: RatingValue;
	from_date?: string;
	to_date?: string;
	sort_by?: "created_desc" | "created_asc" | "updated_desc" | "updated_asc" | "rating_desc" | "rating_asc";
}

export interface AdminRatingItem {
	id: string;
	user_id: string;
	user_name: string | null;
	run_id: string;
	thread_id: string;
	thread_name: string | null;
	agent_id: string | null;
	rating: RatingValue;
	comment: string | null;
	question: string;
	answer: string;
	created_at: string;
	updated_at: string;
}

export interface AdminRatingListResponse {
	items: AdminRatingItem[];
	page: number;
	page_size: number;
	total_items: number;
	total_pages: number;
}

export const ratingService = {
	async createOrUpdate(rating: RatingCreate): Promise<RatingResponse> {
		const response = await apiClient.post<RatingResponse>(
			`/dashboard/ratings`,
			rating
		);
		return response.data;
	},

	async getThreadRatings(threadId: string): Promise<RatingResponse[]> {
		const response = await apiClient.get<RatingResponse[]>(
			`/dashboard/ratings/thread/${threadId}`
		);
		return response.data;
	},

	async deleteRating(ratingId: string): Promise<void> {
		await apiClient.delete(`/dashboard/ratings/${ratingId}`);
	},

	async listAdminRatings(params: AdminRatingListParams): Promise<AdminRatingListResponse> {
		const response = await apiClient.get<AdminRatingListResponse>(`/dashboard/ratings/admin`, {
			params: {
				page: params.page,
				page_size: params.page_size,
				search: params.search || undefined,
				rating: params.rating || undefined,
				from_date: params.from_date || undefined,
				to_date: params.to_date || undefined,
				sort_by: params.sort_by || undefined,
			},
		});
		return response.data;
	},

	async getAdminRatingStats(params: AdminRatingStatsParams): Promise<AdminRatingStatsResponse> {
		const response = await apiClient.get<AdminRatingStatsResponse>(`/dashboard/ratings/admin/stats`, {
			params: {
				search: params.search || undefined,
				from_date: params.from_date || undefined,
				to_date: params.to_date || undefined,
			},
		});
		return response.data;
	},
};

export default ratingService;
