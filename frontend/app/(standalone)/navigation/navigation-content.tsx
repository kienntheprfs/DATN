"use client";

import { usePageTitle } from "@/hooks/use-page-title";
import NavigationPage from "@/components/features/navigation/NavigationPage";

export default function NavigationContent() {
	usePageTitle();
	return <NavigationPage />;
}