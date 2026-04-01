import { apiClient } from './auth-api';
import { Event, EventCreate, EventUpdate } from '@/types';

export const eventsApi = {
  list: async (activeOnly = true): Promise<Event[]> => {
    const response = await apiClient.get('/wayfinder/api/events', { params: { active_only: activeOnly } });
    return response.data;
  },

  listWithLocation: async (activeOnly = false): Promise<Event[]> => {
    const response = await apiClient.get('/wayfinder/api/events/all', { params: { active_only: activeOnly } });
    return response.data;
  },

  upcoming: async (limit = 10): Promise<Event[]> => {
    const response = await apiClient.get('/wayfinder/api/events/upcoming', { params: { limit } });
    return response.data;
  },

  search: async (query: string, limit = 5): Promise<Event[]> => {
    const response = await apiClient.get('/wayfinder/api/events/search', { params: { q: query, limit } });
    return response.data;
  },

  get: async (id: number): Promise<Event> => {
    const response = await apiClient.get(`/wayfinder/api/events/${id}`);
    return response.data;
  },

  create: async (data: EventCreate): Promise<Event> => {
    const response = await apiClient.post('/wayfinder/api/events', data);
    return response.data;
  },

  update: async (id: number, data: EventUpdate): Promise<Event> => {
    const response = await apiClient.patch(`/wayfinder/api/events/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/wayfinder/api/events/${id}`);
  },
};
