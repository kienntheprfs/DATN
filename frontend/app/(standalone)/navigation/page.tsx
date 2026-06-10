import { Suspense } from "react";
import NavigationContent from "./navigation-content";

export default function Navigation() {
  return (
    <Suspense fallback={<div>Đang tải bản đồ dẫn đường...</div>}>
      <NavigationContent />
    </Suspense>
  );
}