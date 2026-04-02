"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, User, Square, ChevronDown, Loader2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MapToolResult } from "./MapPreview";
import { MapData, MapNode, Instruction } from "@/types";
import { MiniNavigation } from "./MapPreview";
import { useRouter } from "next/navigation";
import { Navigation } from "lucide-react";
import { RatingButtons } from "./RatingButtons";

interface ToolCall {
	id: string;
	name: string;
	status: "executing" | "done";
	content: string | null;
}

interface RouteMapData {
	map: MapData;
	nodes: MapNode[];
	edges: any[];
}

interface RouteData {
	type: "route";
	start_name: string;
	end_name: string;
	map: MapData;
	path_coords: number[][];
	path_node_ids: number[];
	total_distance_m: number;
	instructions: Instruction[];
	is_multi_floor?: boolean;
	route_maps?: RouteMapData[];
	floor_count?: number;
}

interface ChatMessageWithRoute extends ChatMessage {
	routeData?: RouteData;
}

interface ChatWindowProps {
	messages: ChatMessage[];
	error: string | null;
	isStreaming?: boolean;
	isTyping?: boolean;
	isVoiceMode?: boolean;
	isListening?: boolean;
	currentTools?: ToolCall[];
	partialText?: string;
	threadId?: string;
	agentId?: string;
	lastRunId?: string;
	voiceThreadId?: string;
	voiceState?: string;
}

function TypingIndicator() {
	return (
		<div className="flex items-center gap-1 p-2">
			<span className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
			<span className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
			<span className="size-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
		</div>
	);
}

function StreamingCursor() {
	return (
		<span className="inline-block size-0.5 bg-primary ml-0.5 align-middle animate-pulse" />
	);
}

function VoiceLoadingIndicator({ isListening }: { isListening: boolean }) {
	return (
		<div className="flex items-center gap-3 px-4 py-3 bg-primary/10 rounded-lg border border-primary/20">
			<div className="relative">
				<Bot className="size-5 text-primary" />
				<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-500 rounded-full animate-pulse" />
			</div>
			<div className="flex items-center gap-1">
				{[0, 1, 2].map((i) => (
					<span
						key={i}
						className="size-1.5 rounded-full bg-primary animate-bounce"
						style={{ animationDelay: `${i * 100}ms` }}
					/>
				))}
			</div>
		</div>
	);
}

function ThinkingText() {
	return (
		<span className="inline-flex items-center ml-1">
			<span className="animate-pulse">.</span>
			<span className="animate-pulse" style={{ animationDelay: "150ms" }}>.</span>
			<span className="animate-pulse" style={{ animationDelay: "300ms" }}>.</span>
		</span>
	);
}

function ThinkingIndicator() {
	return (
		<div className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg border border-primary/20 shadow-sm">
			<div className="relative flex items-center gap-2">
				<div className="flex gap-0.5">
					<span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
					<span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
					<span className="size-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
				</div>
				<span className="text-sm text-muted-foreground">
					Đang xử lý...
				</span>
			</div>
		</div>
	);
}

function ToolCollapsible({ tool }: { tool: ToolCall }) {
	const [isOpen, setIsOpen] = useState(false);

	let parsedContent: Record<string, unknown> | null = null;
	let isJson = false;
	
	if (tool.content) {
		try {
			parsedContent = JSON.parse(tool.content);
			isJson = true;
		} catch {
			parsedContent = { content: tool.content };
		}
	}

	const isRouteTool = tool.name.toLowerCase().includes('route') || 
	                    tool.name.toLowerCase().includes('find') ||
	                    tool.name.toLowerCase().includes('map');

	const isDone = tool.status === "done";
	const isExecuting = tool.status === "executing";

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border border-blue-200 bg-blue-50/50 overflow-hidden">
			<CollapsibleTrigger asChild>
				<Button variant="ghost" className="w-full justify-start h-auto py-3 px-4">
					<ChevronDown
						className={`size-4 text-blue-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}
					/>
					<div className="flex items-center gap-2">
						<div className="relative">
							{isDone ? (
								<div className="size-4 rounded-full bg-blue-500 flex items-center justify-center">
									<svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
									</svg>
								</div>
							) : (
								<div className={`size-4 rounded-full border-2 ${isExecuting ? 'border-blue-500 border-t-transparent animate-spin' : 'border-blue-400'}`} />
							)}
						</div>
						<span className="text-sm font-medium text-blue-700">
							{tool.name}
						</span>
						{isDone && (
							<span className="text-xs text-blue-600/70">Hoàn tất</span>
						)}
					</div>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="px-4 pb-3 text-xs text-blue-600/80 border-t border-blue-200/50 pt-2">
					{tool.content ? (
						<div className="bg-blue-100/50 rounded p-2 max-h-64 overflow-y-auto">
							{isJson ? (
								<>
									{parsedContent?.query && (
										<div className="mb-2">
											<span className="font-semibold">Query: </span>
											<span className="font-mono">{String(parsedContent.query)}</span>
										</div>
									)}
									{parsedContent?.results && Array.isArray(parsedContent.results) && (
										<div className="space-y-1">
											<span className="font-semibold">Results ({(parsedContent.results as unknown[]).length}):</span>
											{(parsedContent.results as unknown[]).slice(0, 5).map((r: unknown, i: number) => {
												const result = r as Record<string, unknown>;
												return (
													<div key={i} className="pl-2 border-l-2 border-blue-300 whitespace-pre-wrap">
														{result.title ? <div className="font-medium">{String(result.title)}</div> : null}
														<div className="line-clamp-2">{String(result.content || result.snippet || JSON.stringify(result))}</div>
													</div>
												);
											})}
										</div>
									)}
								</>
							) : (
								<pre className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-auto">
									{tool.content}
								</pre>
							)}
						</div>
					) : (
						<div className="bg-blue-100/50 rounded p-2 font-mono">
							Đang thực thi tool...
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

function RouteMessage({ routeData }: { routeData: RouteData }) {
	const router = useRouter();

	if (!routeData) {
		return (
			<div className="p-4 text-sm text-muted-foreground">
				Đang tải lộ trình...
			</div>
		);
	}

	if (routeData.is_multi_floor) {
		const navUrl = new URL("/navigation", window.location.origin);
		navUrl.searchParams.set("start", routeData.start_name);
		navUrl.searchParams.set("end", routeData.end_name);
		navUrl.searchParams.set("start_node", routeData.path_node_ids[0]?.toString() || "");
		navUrl.searchParams.set("end_node", routeData.path_node_ids[routeData.path_node_ids.length - 1]?.toString() || "");

		return (
			<div className="p-4 bg-blue-600 text-white rounded-lg shadow-md">
				<div className="flex items-start gap-3">
					<Navigation className="w-6 h-6 mt-0.5" />
					<div className="flex-1">
						<h4 className="font-bold text-lg mb-1">
							Đường đi qua {routeData.floor_count} tầng
						</h4>
						<p className="text-sm text-blue-100 mb-3">
							Từ <strong>{routeData.start_name}</strong> đến{" "}
							<strong>{routeData.end_name}</strong>
							<br />
							Khoảng cách: {Math.round(routeData.total_distance_m)}m
						</p>
						<button
							onClick={() => router.push(navUrl.toString())}
							className="inline-flex items-center gap-2 px-4 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors shadow-sm"
						>
							<Navigation className="w-4 h-4" />
							Mở bản đồ dẫn đường
						</button>
					</div>
				</div>
			</div>
		);
	}

	return <MiniNavigation routeData={routeData} />;
}

interface GroupedMessages {
	role: "user" | "assistant";
	messages: ChatMessage[];
}

export function ChatWindow({ messages, error, isStreaming, isTyping, isVoiceMode, isListening, currentTools = [], partialText, threadId, agentId, lastRunId, voiceThreadId, voiceState }: ChatWindowProps) {
	const isActive = isStreaming || isTyping;
	const scrollRef = useRef<HTMLDivElement>(null);
	
	const visibleMessages = messages;
	
	const lastBotMessage = visibleMessages.filter(m => m.role === "assistant").pop();
	const displayText = partialText || lastBotMessage?.content || "";
	const hasBotContent = lastBotMessage?.content && lastBotMessage.content.length > 0;
	const isThinking = isActive && !hasBotContent && !partialText && currentTools.length === 0;

	const hasVoiceMessage = visibleMessages.length > 0;

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [visibleMessages, currentTools.length]);

	// Extract route data from completed tools
	const routeData = useMemo(() => {
		const routeTool = currentTools.find(tool => {
			const name = tool.name.toLowerCase();
			return (name.includes('route') || name.includes('find') || name.includes('map')) && tool.status === "done";
		});
		
		if (routeTool?.content) {
			try {
				const parsed = JSON.parse(routeTool.content);
				if (parsed.type === 'route') {
					return parsed as RouteData;
				}
			} catch {
				// Not JSON
			}
		}
		return null;
	}, [currentTools]);

	const groupedMessages = useMemo(() => {
		const groups: GroupedMessages[] = [];

		for (const m of visibleMessages) {
			const lastGroup = groups[groups.length - 1];
			if (lastGroup && lastGroup.role === m.role && m.role === "assistant" && currentTools.length === 0) {
				lastGroup.messages.push(m);
			} else {
				groups.push({ role: m.role, messages: [m] });
			}
		}

		return groups;
	}, [visibleMessages, currentTools.length]);

	return (
		<div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
				{groupedMessages.map((group, groupIndex) => {
					const isLastGroup = groupIndex === groupedMessages.length - 1;
					const isMessageActive = isLastGroup && isActive;
					const combinedContent = group.role === "assistant" 
						? group.messages.map(m => m.content).filter(Boolean).join(" ")
						: "";
					const isThinkingMessage = isMessageActive && !combinedContent && !isVoiceMode && currentTools.length === 0;
					const showToolsForThisGroup = isLastGroup && currentTools.length > 0;

					if (group.role === "user") {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
									<User className="size-6" />
								</div>
								<div className="group relative max-w-[85%] space-y-2">
									{group.messages.map((m) => (
										<div key={m.id} className="p-4 text-sm rounded-none shadow-sm bg-muted text-foreground">
											<p className="whitespace-pre-wrap">{String(m.content)}</p>
										</div>
									))}
								</div>
							</div>
						);
					}

					if (isThinkingMessage) {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
									<div className="relative">
										<Bot className="size-6" />
									</div>
								</div>
								<div className="flex-1 max-w-[85%]">
									<ThinkingIndicator />
								</div>
							</div>
						);
					}

					if (showToolsForThisGroup && !combinedContent && !routeData) {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
									<Bot className="size-6" />
								</div>
								<div className="flex-1 max-w-[85%]">
									{currentTools.map((tool) => (
										<ToolCollapsible key={tool.id} tool={tool} />
									))}
								</div>
							</div>
						);
					}

					return (
						<div key={`group-${groupIndex}`} className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
							<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
								<Bot className="size-6" />
							</div>
							<div className="group relative max-w-[85%] space-y-3">
								{showToolsForThisGroup && !routeData && currentTools.map((tool) => (
									<ToolCollapsible key={tool.id} tool={tool} />
								))}
								{combinedContent && (
									<div className="p-4 text-sm rounded-none shadow-sm transition-all duration-200 border bg-background border-border">
										<div className="prose prose-sm dark:prose-invert max-w-none [&_a]:text-primary [&_a]:underline [&_a]:decoration-primary/50 [&_a]:hover:decoration-primary">
											<Markdown remarkPlugins={[remarkGfm]}>
												{combinedContent}
											</Markdown>
										</div>
									</div>
								)}
								{combinedContent && lastBotMessage?.run_id && threadId && (
									<div className="flex items-center gap-1 pl-2">
										<RatingButtons
											runId={lastBotMessage.run_id}
											threadId={threadId}
											agentId={agentId}
										/>
									</div>
								)}
							</div>
						</div>
					);
				})}

				{routeData && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<Bot className="size-6" />
						</div>
						<div className="flex-1 max-w-[85%]">
							<RouteMessage routeData={routeData} />
						</div>
					</div>
				)}

				{error && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2">
						<div className="flex size-10 shrink-0 items-center justify-center bg-red-600 text-white rounded-none shadow-sm">
							<AlertTriangle className="size-5" />
						</div>
						<div className="max-w-[85%] p-4 text-sm rounded-none shadow-sm border border-red-500 bg-red-50 text-red-700">
							<p className="font-bold mb-1">Ối, hệ thống gặp sự cố rồi!</p>
							<p>Không thể kết nối đến máy chủ. Vui lòng thử lại sau.</p>
							<p className="text-xs mt-1 opacity-70">{error}</p>
						</div>
					</div>
				)}

				{(voiceState === "connecting" || (voiceState === "connected" && !hasVoiceMessage)) && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<Loader2 className="size-5 animate-spin" />
						</div>
						<div className="flex-1 max-w-[85%] flex items-center">
							<span className="text-sm text-muted-foreground">Đang kết nối...</span>
						</div>
					</div>
				)}

				{voiceState === "connected" && hasVoiceMessage && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<div className="relative">
								<Bot className="size-6" />
								<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-400 rounded-full animate-pulse" />
							</div>
						</div>
						<div className="flex-1 max-w-[85%]">
							<VoiceLoadingIndicator isListening={isListening || false} />
						</div>
					</div>
				)}

				{voiceState === "connected" && hasVoiceMessage && lastRunId && (voiceThreadId || threadId) && (
					<div className="flex items-center gap-1 pl-2">
						<RatingButtons
							runId={lastRunId}
							threadId={voiceThreadId || threadId || ""}
							agentId={agentId}
						/>
					</div>
				)}
			</div>
		</div>
	);
}
