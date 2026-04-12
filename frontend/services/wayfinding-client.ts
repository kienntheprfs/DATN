export const getFullImageUrl = (path: string) => {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return path.startsWith("/") ? "/api/wayfinder/static"+ path : `/${path}`;
};
