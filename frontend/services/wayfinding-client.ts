import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

export const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/wayfinder`
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}/wayfinder/static/${path}`;
};
