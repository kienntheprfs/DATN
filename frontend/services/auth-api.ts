import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import { User, TokenResponse, LoginRequest, RegisterRequest } from '@/types';

const API_URL = '/api';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getRetryDelay = (retryCount: number) => RETRY_DELAY * Math.pow(2, retryCount);

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
});

const isRetryableError = (error: AxiosError): boolean => {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 408 || status === 429 || status >= 500;
};

interface CustomAxiosConfig extends AxiosRequestConfig {
  _retryCount?: number;
  _retry?: boolean;
  _skipAuthRefresh?: boolean;
  _skipRetry?: boolean;
}

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
  const hasToken = !!localStorage.getItem('access_token');
  const hasRefreshToken = !!localStorage.getItem('refresh_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  if (hasToken || hasRefreshToken) {
    window.location.href = '/auth';
  }
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

const getGuestId = (): string => {
  if (typeof window === "undefined") return 'guest';
  let guestId = localStorage.getItem('guest_id');
  if (!guestId) {
    guestId = `guest-${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('guest_id', guestId);
  }
  return guestId;
};

const getCommonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  
  if (typeof window !== "undefined") {
    const token = localStorage.getItem('access_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const user = localStorage.getItem('user');
    if (user) {
      try {
        const parsed = JSON.parse(user);
        headers['X-User-Id'] = parsed.id?.toString() || parsed.sub?.toString() || getGuestId();
      } catch {
        headers['X-User-Id'] = getGuestId();
      }
    } else {
      headers['X-User-Id'] = getGuestId();
    }
  }
  
  return headers;
};

apiClient.interceptors.request.use(async (config) => {
  if (typeof window === "undefined") {
    return config;
  }
  
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

const retryRequest = async (config: AxiosRequestConfig, retryCount: number): Promise<any> => {
  await sleep(getRetryDelay(retryCount));
  return apiClient(config);
};

const showRetryError = (attempt: number, error: AxiosError) => {
  const status = error.response?.status;
  const message = error.message || 'Lỗi kết nối';
  let errorMsg = `Lỗi ${attempt}/${MAX_RETRIES}: ${message}`;
  
  if (status === 500) errorMsg = `Lỗi server (${status}). Vui lòng thử lại sau.`;
  else if (status === 502 || status === 503) errorMsg = `Server đang bảo trì. Vui lòng thử lại sau.`;
  else if (status === 429) errorMsg = 'Quá nhiều yêu cầu. Vui lòng chờ một lát.';
  else if (!status) errorMsg = 'Không thể kết nối server. Vui lòng kiểm tra kết nối mạng.';
  
  toast.error(errorMsg, { duration: 4000 });
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as CustomAxiosConfig;
    
    if (!originalRequest) {
      return Promise.reject(error);
    }
    
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest._skipAuthRefresh) {
      originalRequest._retry = true;
      
      if (!isRefreshing) {
        isRefreshing = true;
        try {
          const newToken = await refreshAccessToken();
          isRefreshing = false;
          
          if (newToken && originalRequest.headers) {
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
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
            }
            resolve(apiClient(originalRequest));
          });
          onRefreshFailed();
        });
      }
    }
    
    if (!originalRequest._skipRetry && isRetryableError(error)) {
      const retryCount = originalRequest._retryCount || 0;
      
      if (retryCount < MAX_RETRIES) {
        originalRequest._retryCount = retryCount + 1;
        return retryRequest(originalRequest, retryCount);
      }
      
      showRetryError(retryCount + 1, error);
    }
    
    return Promise.reject(error);
  }
);

export const authService = {
  register: async (data: RegisterRequest): Promise<User> => {
    const response = await apiClient.post<User>('/auth/register', data, {
      _skipAuthRefresh: true,
      _skipRetry: true,
    } as any);
    return response.data;
  },

  login: async (email: string, password: string): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/login', { email, password }, {
      _skipAuthRefresh: true,
      _skipRetry: true,
    } as any);
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

  googleLogin: async (data: { credential?: string; access_token?: string }): Promise<TokenResponse> => {
    const response = await apiClient.post<TokenResponse>('/auth/google', data, {
      _skipAuthRefresh: true,
      _skipRetry: true,
    } as any);
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
        await apiClient.post('/auth/logout', { refresh_token: refreshToken }, {
          _skipAuthRefresh: true,
          _skipRetry: true,
        } as any);
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

export const getUserId = (): string | null => {
  if (typeof window === "undefined") return null;
  const user = localStorage.getItem("user");
  if (!user) return getGuestId();
  try {
    const parsed = JSON.parse(user);
    return parsed.id?.toString() || parsed.sub?.toString() || getGuestId();
  } catch {
    return getGuestId();
  }
};

export default authService;
