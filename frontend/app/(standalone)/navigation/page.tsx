import { Suspense } from "react";
import NavigationContent from "./navigation-content";

export default function Navigation() {
  return (
    <Suspense fallback={<div>Loading navigation...</div>}>
      <NavigationContent />
    </Suspense>
  );
}