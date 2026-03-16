// src/shared/api/client.ts
import axios from 'axios';

export const API_BASE_URL = "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL
});

// Helper để lấy URL ảnh full
export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}/static/${path}`;
};