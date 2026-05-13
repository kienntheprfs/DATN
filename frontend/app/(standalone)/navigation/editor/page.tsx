import { Suspense } from "react";
import EditorContent from "./editor-content";
import { Loader2 } from "lucide-react";

export default function Editor() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-text-secondary">Đang tải trình chỉnh sửa bản đồ...</p>
      </div>
    }>
      <EditorContent />
    </Suspense>
  );
}