import axios from 'axios';
import { User, TokenResponse, LoginRequest, RegisterRequest } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8002';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const decodeJWT = (token: string): { exp: number; iat: number } | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
};

const isTokenExpiringSoon = (token: string, minutesThreshold = 5): boolean => {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return (payload.exp - now) < minutesThreshold * 60;
};

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

const subscribeTokenRefresh = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

const onTokenRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

const onRefreshFailed = () => {
  refreshSubscribers = [];
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  window.location.href = '/auth';
};

export const refreshAccessToken = async (): Promise<string | null> => {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) {
    onRefreshFailed();
    return null;
  }

  try {
    const response = await axios.post<TokenResponse>(`${API_URL}/auth/refresh`, {
      refresh_token: refreshToken,
    });

    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
      onTokenRefreshed(response.data.access_token);
      return response.data.access_token;
    }
  } catch {
    onRefreshFailed();
  }
  return null;
};

const getCommonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  
  const token = localStorage.getItem('access_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const user = localStorage.getItem('user');
  if (user) {
    try {
      const parsed = JSON.parse(user);
      headers['X-User-Id'] = parsed.id?.toString() || parsed.sub?.toString() || 'guest';
    } catch {
      headers['X-User-Id'] = 'guest';
    }
  } else {
    headers['X-User-Id'] = 'guest';
  }
  
  return headers;
};

apiClient.interceptors.request.use(async (config) => {
  const token = localStorage.getItem('access_token');
  
  if (token && isTokenExpiringSoon(token)) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      
      if (newToken) {
        config.headers.Authorization = `Bearer ${newToken}`;
      }
    } else {
      return new Promise((resolve) => {
        subscribeTokenRefresh((newToken) => {
          config.headers.Authorization = `Bearer ${newToken}`;
          resolve(config);
        });
      });
    }
  }
  
  Object.assign(config.headers, getCommonHeaders());
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          
          if (newToken) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch {
          isRefreshing = false;
          onRefreshFailed();
        }
      } else {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(apiClient(originalRequest));
          });
          onRefreshFailed();
        });
      }
    }
    
    return Promise.reject(error);
  }
);

export const authService = {
  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post<User>('/auth/register', data);
    return response.data;
  },

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/login', { email, password });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
    }
    try {
      const userResponse = await apiClient.get<User>('/auth/me');
      localStorage.setItem('user', JSON.stringify(userResponse.data));
    } catch {
      // Ignore error if can't get user info
    }
    return response.data;
  },

  googleLogin: async (credential: string): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/google', { credential });
    if (response.data.access_token) {
      localStorage.setItem('access_token', response.data.access_token);
      localStorage.setItem('refresh_token', response.data.refresh_token || '');
    }
    try {
      const userResponse = await apiClient.get<User>('/auth/me');
      localStorage.setItem('user', JSON.stringify(userResponse.data));
    } catch {
      // Ignore error if can't get user info
    }
    return response.data;
  },

  logout: async (): Promise<void> => {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refresh_token: refreshToken });
      } catch {
        // Ignore logout errors
      }
    }
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  me: async (): Promise<User> => {
    const response = await apiClient.get<User>('/auth/me');
    return response.data;
  },

  refresh: async (refreshToken: string): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/refresh', { refresh_token: refreshToken });
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

  isTokenExpiringSoon: (minutesThreshold = 5): boolean => {
    const token = localStorage.getItem('access_token');
    if (!token) return false;
    return isTokenExpiringSoon(token, minutesThreshold);
  },
};

export const getAuthHeaders = () => getCommonHeaders();

export default authService;
