export const API_BASE_URL = "/api";

export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${API_BASE_URL}/wayfinder/static/${path}`;
};
