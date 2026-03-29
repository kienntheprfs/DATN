import axios from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8004";

export const apiClient = axios.create({
  baseURL: API_BASE_URL
});

export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}/static/${path}`;
};
