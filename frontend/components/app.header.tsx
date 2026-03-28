"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAgent } from "@/contexts/agent-context";
import { Loader2 } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";

const routeDictionary: Record<string, string> = {
	dashboard: "Bảng điều khiển",
	history: "Lịch sử tra cứu",
	settings: "Cấu hình hệ thống",
	knowledge: "Kho văn bản",
	navigation: "Tìm đường",
	chat: "Trò chuyện với AI",
};

function StatusBadge() {
	const { isOnline, isLoading, model, models } = useAgent();

	if (isLoading) {
		return (
			<div className="flex items-center gap-1.5 px-2 py-1 bg-surface-bg border border-border-color rounded-sm">
				<Loader2 className="w-3 h-3 animate-spin text-text-secondary" />
				<span className="text-xs font-mono text-text-secondary">Loading...</span>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-1.5 px-2 py-1 bg-surface-bg border border-border-color rounded-sm">
			<span className={`w-2 h-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
			<span className="text-xs font-mono text-text-secondary">
				{model || "RAG"} {isOnline ? "Online" : "Offline"}
			</span>
		</div>
	);
}

function SettingsPanel() {
	const { model, setModel, agent, setAgent, agents, isOnline, models } = useAgent();
	const [isOpen, setIsOpen] = React.useState(false);

	if (!isOnline) return null;

	return (
		<div className="relative">
			<Button
				variant="ghost"
				size="sm"
				onClick={() => setIsOpen(!isOpen)}
				className="h-7 text-xs font-mono"
			>
				Settings ▼
			</Button>

			{isOpen && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
					<div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border rounded-lg shadow-lg p-3">
						<div className="mb-3">
							<label className="text-xs font-semibold mb-2 block">LLM Model</label>
							<NativeSelect 
								value={model} 
								onChange={(e) => setModel(e.target.value)}
								className="w-full px-2 py-1.5 text-xs bg-surface-bg border border-border-color rounded-sm"
							>
								<NativeSelectOption value="azure-gpt-4o">Default</NativeSelectOption>
								{models.map((m) => (
									<NativeSelectOption key={m.id} value={m.id}>
										{m.name}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</div>

						<div>
							<label className="text-xs font-semibold mb-2 block">Agent</label>
							<NativeSelect 
								value={agent} 
								onChange={(e) => setAgent(e.target.value)}
								className="w-full px-2 py-1.5 text-xs bg-surface-bg border border-border-color rounded-sm"
							>
								{agents.map((a) => (
									<NativeSelectOption key={a.key} value={a.key}>
										{a.key}
									</NativeSelectOption>
								))}
							</NativeSelect>
						</div>
					</div>
				</>
			)}
		</div>
	);
}

export function AppHeader() {
	const pathname = usePathname();
	const pathSegments = pathname === "/" ? [] : pathname.split("/").filter((segment) => segment);

	return (
		<header className="sticky top-0 z-10 flex h-10 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
			<SidebarTrigger className="-ml-3" />

			<div className="mr-2 h-4 w-px bg-border" />

			<Breadcrumb>
				<BreadcrumbList>
					<BreadcrumbItem className="hidden md:block">
						<BreadcrumbLink asChild>
							<Link href="/">Trang chủ</Link>
						</BreadcrumbLink>
					</BreadcrumbItem>

					{pathSegments.length > 0 && <BreadcrumbSeparator className="hidden md:block" />}

					{pathSegments.map((segment, index) => {
						const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
						const isLast = index === pathSegments.length - 1;
						const title = routeDictionary[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);

						return (
							<React.Fragment key={href}>
								<BreadcrumbItem>
									{isLast ? (
										<BreadcrumbPage>{title}</BreadcrumbPage>
									) : (
										<BreadcrumbLink asChild>
											<Link href={href}>{title}</Link>
										</BreadcrumbLink>
									)}
								</BreadcrumbItem>

								{!isLast && <BreadcrumbSeparator />}
							</React.Fragment>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>

			<div className="ml-auto flex items-center gap-2">
				<StatusBadge />
				<SettingsPanel />
			</div>
		</header>
	);
}
