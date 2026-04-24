export type PinnedCategory =
  | "Quy chế Đào tạo"
  | "Sau Đại học"
  | "Công tác Sinh viên"
  | "Nghiên cứu Khoa học";

export type PinnedSortMode = "latest" | "manual" | "alphabetical";

export interface PinnedPost {
  id: string;
  order: number;
  title: string;
  refId: string;
  category: PinnedCategory;
  pinnedDate: string;
  summary: string;
  sourceUrl: string;
  documentType: string;
  tags: string[];
}

export interface PinnedFormData {
  title: string;
  summary: string;
  documentType: string;
  sourceUrl: string;
}
