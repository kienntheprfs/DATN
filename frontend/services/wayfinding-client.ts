export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8002";

export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}/wayfinder/static/${path}`;
};
