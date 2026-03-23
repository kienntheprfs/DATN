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

const routeDictionary: Record<string, string> = {
	dashboard: "Bảng điều khiển",
	history: "Lịch sử tra cứu",
	settings: "Cấu hình hệ thống",
	knowledge: "Kho văn bản",
	navigation: "Tìm đường",
	chat: "Trò chuyện với AI",
};

function StatusBadge() {
	const { isOnline, isLoading, model } = useAgent();

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
	const { model, setModel, agent, setAgent, agents, isOnline } = useAgent();
	const [isOpen, setIsOpen] = React.useState(false);

	if (!isOnline) return null;

	return (
		<div className="relative">
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1.5 px-2 py-1 bg-surface-bg border border-border-color rounded-sm hover:bg-accent hover:text-accent-foreground transition-colors"
			>
				<span className="text-xs font-mono text-text-secondary">Settings ▼</span>
			</button>

			{isOpen && (
				<>
					<div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
					<div className="absolute right-0 top-full mt-1 z-50 w-64 bg-background border border-border-color rounded-sm shadow-lg">
						<div className="p-3 border-b border-border-color">
							<div className="text-xs font-semibold text-text-secondary mb-2">LLM Model</div>
							<select
								value={model}
								onChange={(e) => setModel(e.target.value)}
								className="w-full px-2 py-1.5 text-xs bg-surface-bg border border-border-color rounded-sm"
							>
								<option value="">Default</option>
								<option value="gpt-5-nano">GPT-5 Nano</option>
								<option value="gpt-5-mini">GPT-5 Mini</option>
								<option value="gpt-5.1">GPT-5.1</option>
								<option value="deepseek-chat">DeepSeek Chat</option>
								<option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
								<option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
							</select>
						</div>

						<div className="p-3">
							<div className="text-xs font-semibold text-text-secondary mb-2">Agent</div>
							<select
								value={agent}
								onChange={(e) => setAgent(e.target.value)}
								className="w-full px-2 py-1.5 text-xs bg-surface-bg border border-border-color rounded-sm"
							>
								{agents.map((a) => (
									<option key={a.key} value={a.key}>
										{a.key}
									</option>
								))}
							</select>
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
		<header className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-4">
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
