export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("/api/wayfinder/static")) return path;
  
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `/api/wayfinder/static${cleanPath}`;
};
