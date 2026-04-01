import axios from 'axios';
import { User, TokenResponse, LoginRequest, RegisterRequest } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

const authApi = axios.create({
  baseURL: `${API_URL}/auth`,
  headers: {
    'Content-Type': 'application/json',
  },
});

authApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      window.location.href = '/auth';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  register: async (data: RegisterRequest): Promise<User> => {
    const response = await authApi.post<User>('/register', data);
    return response.data;
  },

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const response = await authApi.post<TokenResponse>('/login', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
    }
    return response.data;
  },

  googleLogin: async (credential: string): Promise<TokenResponse> => {
    const response = await authApi.post<TokenResponse>('/google', { credential });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
    }
    return response.data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await authApi.post('/logout', { refresh_token: refreshToken });
      } catch {
        // Ignore logout errors
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  me: async (): Promise<User> => {
    const response = await authApi.get<User>('/me');
    return response.data;
  },

  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const response = await authApi.post<TokenResponse>('/refresh', { refresh_token: refreshToken });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
    }
    return response.data;
  },

  getToken: (): string | null => {
    return localStorage.getItem('access_token');
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('access_token');
  },
};

export default authService;
