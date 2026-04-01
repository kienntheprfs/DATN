import axios from 'axios';
import { Event, EventCreate, EventUpdate } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

const api = axios.create({
  baseURL: `${API_URL}/wayfinder/api/events`,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const eventsApi = {
  list: async (activeOnly = true): Promise<Event[]> => {
    const response = await api.get('', { params: { active_only: activeOnly } });
    return response.data;
  },

  listWithLocation: async (activeOnly = false): Promise<Event[]> => {
    const response = await api.get('/all', { params: { active_only: activeOnly } });
    return response.data;
  },

  upcoming: async (limit = 10): Promise<Event[]> => {
    const response = await api.get('/upcoming', { params: { limit } });
    return response.data;
  },

  search: async (query: string, limit = 5): Promise<Event[]> => {
    const response = await api.get('/search', { params: { q: query, limit } });
    return response.data;
  },

  get: async (id: number): Promise<Event> => {
    const response = await api.get(`/${id}`);
    return response.data;
  },

  create: async (data: EventCreate): Promise<Event> => {
    const response = await api.post('', data);
    return response.data;
  },

  update: async (id: number, data: EventUpdate): Promise<Event> => {
    const response = await api.patch(`/${id}`, data);
    return response.data;
  },

  delete: async (id: number): Promise<void> => {
    await api.delete(`/${id}`);
  },
};
