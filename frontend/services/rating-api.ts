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

const DASHBOARD_API_BASE = '/api';

export const ratingService = {
	async createOrUpdate(rating: RatingCreate): Promise<RatingResponse> {
		const response = await apiClient.post<RatingResponse>(
			`${DASHBOARD_API_BASE}/dashboard/ratings`,
			rating
		);
		return response.data;
	},

	async getThreadRatings(threadId: string): Promise<RatingResponse[]> {
		const response = await apiClient.get<RatingResponse[]>(
			`${DASHBOARD_API_BASE}/dashboard/ratings/thread/${threadId}`
		);
		return response.data;
	},

	async deleteRating(ratingId: string): Promise<void> {
		await apiClient.delete(`${DASHBOARD_API_BASE}/dashboard/ratings/${ratingId}`);
	},
};

export default ratingService;
