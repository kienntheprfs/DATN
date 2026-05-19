"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, User, Square, ChevronDown, Loader2, Navigation2, CheckCircle2, AlertTriangle, Navigation } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { Button } from "@/components/ui/button";
import { MapData, MapNode, Instruction } from "@/types";
import { useRouter } from "next/navigation";
import { RatingButtons } from "./RatingButtons";
import { MiniNavigation } from "./MapPreview";
import { LandmarkCarousel } from "./LandmarkCarousel";

interface ToolCall {
	id: string;
	name: string;
	status: "executing" | "done";
	content: string | null;
}

interface RouteMapData {
	map: MapData;
	nodes: MapNode[];
	edges: unknown[];
}

interface RouteData {
	type: "route";
	status?: "success" | "error" | "needs_confirmation";
	start_name: string;
	end_name: string;
	map: MapData;
	path_coords: number[][];
	path_node_ids: number[];
	total_distance_m: number;
	instructions: Instruction[];
	floor_count?: number;
	is_multi_floor?: boolean;
	route_maps?: RouteMapData[];
	start_options?: string[];
	end_options?: string[];
	message?: string;
}

interface ChatMessageWithRoute extends ChatMessage {
	routeData?: RouteData;
}

interface ChatWindowProps {
	messages: ChatMessage[];
	error: string | null;
	isStreaming?: boolean;
	isHistoryLoading?: boolean;
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
	readOnly?: boolean;
	sendMessage?: (message: string) => void;
	onCitationClick?: (citation: { file_name: string; s3_url: string; text_preview?: string; source_type: string; doc_id?: string; file_path?: string }) => void;
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

function ConfirmationOptions({ data, onSelect }: { data: RouteData; onSelect: (opt: string) => void }) {
	const needsStart = data.start_options && data.start_options.length > 1;
	const needsEnd = data.end_options && data.end_options.length > 1;
	
	const [selectedStart, setSelectedStart] = useState<string | null>(needsStart ? null : data.start_name || null);
	const [selectedEnd, setSelectedEnd] = useState<string | null>(needsEnd ? null : data.end_name || null);

	const handleConfirm = () => {
		if (needsStart && needsEnd) {
			onSelect(`Tôi muốn đi từ ${selectedStart} đến ${selectedEnd}`);
		} else if (needsStart) {
			onSelect(`Chọn điểm bắt đầu là ${selectedStart}`);
		} else if (needsEnd) {
			onSelect(`Chọn điểm đến là ${selectedEnd}`);
		}
	};

	const canConfirm = (!needsStart || selectedStart) && (!needsEnd || selectedEnd);

	return (
		<div className="flex flex-col gap-4 p-5 rounded-2xl bg-card border border-border shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-500">
			<div className="flex items-center gap-3 mb-1">
				<div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
					<Navigation2 className="w-5 h-5 fill-current" />
				</div>
				<div>
					<h4 className="font-bold text-sm text-foreground">Xác nhận địa điểm</h4>
					<p className="text-xs text-muted-foreground">Vui lòng chọn chính xác vị trí bạn muốn</p>
				</div>
			</div>

			<div className="space-y-4">
				{needsStart && (
					<div className="space-y-2.5">
						<div className="flex items-center gap-2">
							<div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
							<div className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Điểm xuất phát: "{data.start_name}"</div>
						</div>
						<div className="flex flex-wrap gap-2">
							{data.start_options?.map((opt) => (
								<Button
									key={opt}
									variant={selectedStart === opt ? "default" : "outline"}
									size="sm"
									className={`text-xs rounded-xl h-9 px-4 transition-all ${selectedStart === opt ? "shadow-lg shadow-primary/20 scale-105" : "hover:bg-primary/5"}`}
									onClick={() => setSelectedStart(opt)}
								>
									{opt}
								</Button>
							))}
						</div>
					</div>
				)}

				{needsEnd && (
					<div className="space-y-2.5">
						<div className="flex items-center gap-2">
							<div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
							<div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Điểm đến: "{data.end_name}"</div>
						</div>
						<div className="flex flex-wrap gap-2">
							{data.end_options?.map((opt) => (
								<Button
									key={opt}
									variant={selectedEnd === opt ? "default" : "outline"}
									size="sm"
									className={`text-xs rounded-xl h-9 px-4 transition-all ${selectedEnd === opt ? "shadow-lg shadow-primary/20 scale-105" : "hover:bg-primary/5"}`}
									onClick={() => setSelectedEnd(opt)}
								>
									{opt}
								</Button>
							))}
						</div>
					</div>
				)}

				<div className="pt-2 border-t border-border mt-2 flex flex-col gap-3">
					<Button 
						className="w-full h-11 rounded-xl gap-2 font-bold uppercase tracking-wide shadow-lg transition-all active:scale-[0.98]"
						disabled={!canConfirm}
						onClick={handleConfirm}
					>
						<CheckCircle2 className="w-4 h-4" />
						Xác nhận lộ trình
					</Button>

					<Button 
						variant="ghost" 
						size="sm" 
						onClick={() => onSelect("Tôi không biết chính xác ở đâu")}
						className="text-muted-foreground hover:text-foreground text-xs"
					>
						Tôi không biết chính xác ở đâu
					</Button>
				</div>
			</div>
		</div>
	);
}


function HistoryToolCollapsible({ name, content }: { name: string; content: string }) {
	const [isOpen, setIsOpen] = useState(false);

	let parsedContent: Record<string, unknown> | null = null;
	let isJson = false;
	
	if (content) {
		try {
			parsedContent = JSON.parse(content);
			isJson = true;
		} catch {
			parsedContent = { content };
		}
	}

	const isRouteTool = name.toLowerCase().includes('route') || 
	                    name.toLowerCase().includes('find') ||
	                    name.toLowerCase().includes('map');

	const hasMarkdown = !isJson && content.includes('**');

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border border-blue-200 bg-blue-50/50 overflow-hidden">
			<CollapsibleTrigger asChild>
				<Button variant="ghost" className="w-full justify-start h-auto py-3 px-4">
					<ChevronDown
						className={`size-4 text-blue-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}
					/>
					<div className="flex items-center gap-2">
						<div className="relative">
							<div className="size-4 rounded-full bg-blue-500 flex items-center justify-center">
								<svg className="size-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
								</svg>
							</div>
						</div>
						<span className="text-sm font-medium text-blue-700">
							{name === "QueryClassifier" ? "Phân tích & Định tuyến truy vấn" : name}
						</span>
						<span className="text-xs text-blue-600/70">Hoàn tất</span>
					</div>
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="px-4 pb-3 text-xs text-blue-600/80 border-t border-blue-200/50 pt-2">
					{content ? (
						<div className="bg-blue-100/50 rounded p-2 max-h-64 overflow-y-auto">
							{isJson ? (
								<>
									{parsedContent?.classifications && Array.isArray(parsedContent.classifications) && (
										<div className="space-y-2 py-1">
											<div className="font-semibold text-blue-800 mb-1">Định tuyến cuộc hội thoại:</div>
											{(parsedContent.classifications as any[]).map((c, i) => (
												<div key={i} className="pl-3 border-l-2 border-blue-400 space-y-1">
													<div className="flex items-center gap-1.5">
														<span className="font-medium text-blue-700">Agent:</span>
														<span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-800 rounded font-semibold uppercase">
															{c.source === "map_assistant" ? "Bản đồ & Chỉ đường" : "Hỏi đáp & Quy chế"}
														</span>
													</div>
													{c.query && (
														<div>
															<span className="font-medium text-blue-700">Truy vấn:</span>{" "}
															<span className="text-gray-700 italic">"{c.query}"</span>
														</div>
													)}
												</div>
											))}
											{parsedContent.classifications.length === 0 && (
												<div className="text-gray-500 italic">Không chuyển tiếp chuyên biệt (Trò chuyện tự do)</div>
											)}
										</div>
									)}
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
													<div key={i} className="pl-2 border-l-2 border-blue-300">
														{result.name ? <div className="font-medium">{String(result.name)}</div> : null}
														{result.description ? <div className="text-blue-600/80">{String(result.description)}</div> : null}
													</div>
												);
											})}
										</div>
									)}
									{parsedContent?.start_name && parsedContent?.end_name && (
										<div className="mt-2 p-2 bg-blue-200/50 rounded">
											<div><span className="font-semibold">Từ:</span> {String(parsedContent.start_name)}</div>
											<div><span className="font-semibold">Đến:</span> {String(parsedContent.end_name)}</div>
										</div>
									)}
									{!parsedContent?.query && !parsedContent?.results && !parsedContent?.start_name && !parsedContent?.classifications && (
										<pre className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-auto">
											{content}
										</pre>
									)}
								</>
							) : hasMarkdown ? (
								<div className="prose prose-xs dark:prose-invert max-w-none">
									<Markdown remarkPlugins={[remarkGfm]}>
										{content}
									</Markdown>
								</div>
							) : (
								<pre className="whitespace-pre-wrap font-mono text-xs max-h-48 overflow-auto">
									{content}
								</pre>
							)}
						</div>
					) : (
						<div className="bg-blue-100/50 rounded p-2 font-mono">
							Không có kết quả
						</div>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
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

	const hasMarkdown = !isJson && tool.content?.includes('**');

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
							{tool.name === "QueryClassifier" ? "Phân tích & Định tuyến truy vấn" : tool.name}
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
									{parsedContent?.classifications && Array.isArray(parsedContent.classifications) && (
										<div className="space-y-2 py-1">
											<div className="font-semibold text-blue-800 mb-1">Định tuyến cuộc hội thoại:</div>
											{(parsedContent.classifications as any[]).map((c, i) => (
												<div key={i} className="pl-3 border-l-2 border-blue-400 space-y-1">
													<div className="flex items-center gap-1.5">
														<span className="font-medium text-blue-700">Agent:</span>
														<span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-800 rounded font-semibold uppercase">
															{c.source === "map_assistant" ? "Bản đồ & Chỉ đường" : "Hỏi đáp & Quy chế"}
														</span>
													</div>
													{c.query && (
														<div>
															<span className="font-medium text-blue-700">Truy vấn:</span>{" "}
															<span className="text-gray-700 italic">"{c.query}"</span>
														</div>
													)}
												</div>
											))}
											{parsedContent.classifications.length === 0 && (
												<div className="text-gray-500 italic">Không chuyển tiếp chuyên biệt (Trò chuyện tự do)</div>
											)}
										</div>
									)}
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
							) : hasMarkdown ? (
								<div className="prose prose-xs dark:prose-invert max-w-none">
									<Markdown remarkPlugins={[remarkGfm]}>
										{tool.content}
									</Markdown>
								</div>
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
	if (!routeData) {
		return null;
	}

	const estimatedMinutes = Math.ceil(routeData.total_distance_m / 80);
	const isMultiFloor = routeData.is_multi_floor || routeData.floor_count;

	return (
		<div className="p-3 bg-muted/50 border border-border rounded-lg">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Navigation className="w-4 h-4 text-primary" />
					<div>
						<span className="text-sm font-medium">
							{routeData.start_name} → {routeData.end_name}
						</span>
						<span className="text-xs text-muted-foreground ml-2">
							~{estimatedMinutes} phút • {Math.round(routeData.total_distance_m)}m
						</span>
					</div>
				</div>
				{isMultiFloor && (
					<span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
						{routeData.floor_count} tầng
					</span>
				)}
			</div>
		</div>
	);
}

interface GroupedMessages {
	role: "user" | "assistant";
	messages: ChatMessage[];
	toolMessages?: ChatMessage[];
	routeData?: RouteData;
}

export function ChatWindow({ 
	messages, 
	error, 
	isStreaming, 
	isHistoryLoading,
	isTyping, 
	isVoiceMode, 
	isListening, 
	currentTools = [], 
	partialText, 
	threadId, 
	agentId, 
	lastRunId, 
	voiceThreadId, 
	voiceState, 
	readOnly = false,
	sendMessage
}: ChatWindowProps) {
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
			scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
		}
	}, [visibleMessages, currentTools.length, partialText]);

	const groupedMessages = useMemo(() => {
		const groups: GroupedMessages[] = [];

		for (const m of visibleMessages) {
			if (!m.content?.trim() && m.role === "user") continue;
			
			if (m.msgType === "tool") {
				const lastGroup = groups[groups.length - 1];
				if (lastGroup && lastGroup.role === "assistant") {
					if (!lastGroup.toolMessages) lastGroup.toolMessages = [];
					lastGroup.toolMessages.push(m);
				} else {
					groups.push({ role: "assistant", messages: [], toolMessages: [m] });
				}
			} else {
				const lastGroup = groups[groups.length - 1];
				if (lastGroup && lastGroup.role === m.role) {
					lastGroup.messages.push(m);
				} else {
					groups.push({ role: m.role, messages: [m] });
				}
			}
		}

		// Extract routeData for each group
		for (const group of groups) {
			if (group.role !== "assistant") continue;
			// Check both messages and toolMessages for route data
			const messagesToCheck = [...(group.toolMessages || []), ...group.messages];
			for (const m of messagesToCheck) {
				// Check if it's a tool message or has toolName
				const isToolMessage = m.msgType === "tool" || m.toolName;
				if (isToolMessage && m.content) {
					const toolName = (m.toolName || "").toLowerCase();
					if (toolName.includes('route') || toolName.includes('find') || toolName.includes('map')) {
						try {
							const parsed = JSON.parse(m.content);
							if (parsed.type === 'route' && parsed.status === 'success') {
								group.routeData = parsed as RouteData;
								break;
							}
						} catch {
							// Not JSON
						}
					}
				}
			}
		}

		return groups;
	}, [visibleMessages, currentTools]);

	const confirmationData = useMemo(() => {
		const parseConfirmation = (content: string) => {
			try {
				const parsed = JSON.parse(content);
				if (parsed.type === 'route' && parsed.status === 'needs_confirmation') {
					return parsed as RouteData;
				}
				return null;
			} catch {
				return null;
			}
		};

		if (currentTools.length > 0) {
			const confirmationTool = currentTools.find(
				t => t.status === 'done' && t.content && t.content.includes('needs_confirmation')
			);
			if (confirmationTool?.content) {
				return parseConfirmation(confirmationTool.content);
			}
		}
		
		const lastGroup = groupedMessages.filter(g => g.role === "assistant").pop();
		if (lastGroup?.toolMessages) {
			const confirmationToolMsg = lastGroup.toolMessages.find(
				m => m.content && m.content.includes('needs_confirmation')
			);
			if (confirmationToolMsg?.content) {
				return parseConfirmation(confirmationToolMsg.content);
			}
		}
		return null;
	}, [groupedMessages, currentTools]);

	// Get routeData for display - combines history data and current streaming tools
	const routeDataForDisplay = useMemo(() => {
		// First check currentTools for streaming
		if (currentTools.length > 0) {
			const routeTool = currentTools.find(tool => {
				const name = tool.name.toLowerCase();
				return (name.includes('route') || name.includes('find') || name.includes('map')) && tool.status === "done";
			});
			if (routeTool?.content) {
				try {
					const parsed = JSON.parse(routeTool.content);
					if (parsed.type === 'route' && parsed.status === 'success') {
						return parsed as RouteData;
					}
				} catch {
					// Not JSON
				}
			}
		}

		// Then check last assistant group in history
		const assistantGroups = groupedMessages.filter(g => g.role === "assistant");
		const lastGroup = assistantGroups[assistantGroups.length - 1];
		if (lastGroup?.routeData) {
			return lastGroup.routeData;
		}

		return null;
	}, [groupedMessages, currentTools]);

	const landmarkData = useMemo(() => {
		const parseLandmarks = (content: string) => {
			try {
				const parsed = JSON.parse(content);
				if (Array.isArray(parsed)) return parsed;
				if (parsed.landmarks && Array.isArray(parsed.landmarks)) return parsed.landmarks;
				if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
				return null;
			} catch {
				return null;
			}
		};

		if (currentTools.length > 0) {
			const landmarkTool = currentTools.find(
				t => (t.name === 'GetLandmarkImages' || t.name === 'GuessLocationByDescription') && t.status === 'done'
			);
			if (landmarkTool?.content) {
				return parseLandmarks(landmarkTool.content);
			}
		}
		
		const lastGroup = groupedMessages.filter(g => g.role === "assistant").pop();
		if (lastGroup?.toolMessages) {
			const landmarkToolMsg = lastGroup.toolMessages.find(
				m => m.toolName === 'GetLandmarkImages' || m.toolName === 'GuessLocationByDescription'
			);
			if (landmarkToolMsg?.content) {
				return parseLandmarks(landmarkToolMsg.content);
			}
		}
		return null;
	}, [groupedMessages, currentTools]);
	
	useEffect(() => {
		if (routeDataForDisplay || confirmationData || landmarkData || isStreaming) {
			setTimeout(() => {
				scrollRef.current?.scrollTo({
					top: scrollRef.current.scrollHeight,
					behavior: "smooth",
				});
			}, 100);
		}
	}, [routeDataForDisplay, confirmationData, landmarkData, isStreaming]);

	const getGroupRunId = (group: GroupedMessages): string | undefined => {
		if (group.role !== "assistant") return undefined;
		const messagesToCheck = group.messages.length > 0 ? group.messages : group.toolMessages || [];
		for (let i = messagesToCheck.length - 1; i >= 0; i--) {
			if (messagesToCheck[i].run_id) return messagesToCheck[i].run_id;
		}
		return undefined;
	};

	const getGroupId = (group: GroupedMessages): string | undefined => {
		if (group.role !== "assistant") return undefined;
		const messagesToCheck = group.messages.length > 0 ? group.messages : group.toolMessages || [];
		return messagesToCheck[0]?.id;
	};

	return (
		<div
			className={`flex-1 min-h-0 h-full overflow-y-auto p-4 md:p-8 ${readOnly ? "mb-0" : "mb-28"}`}
			role="log"
			aria-live="polite"
		>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4" ref={scrollRef}>
				{isHistoryLoading && messages.length === 0 && (
					<div className="flex gap-4 justify-start animate-in fade-in duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<Bot className="size-6" />
						</div>
						<div className="flex-1 max-w-[85%]">
							<ThinkingIndicator />
						</div>
					</div>
				)}
				{groupedMessages.map((group, groupIndex) => {
					const isLastGroup = groupIndex === groupedMessages.length - 1;
					const isMessageActive = isLastGroup && isActive;
					const groupRunId = getGroupRunId(group);
					const groupId = getGroupId(group);
					const combinedContent = group.role === "assistant" 
						? group.messages.map(m => m.content).filter(Boolean).join(" ")
						: "";
					const isThinkingMessage = isMessageActive && !combinedContent && !isVoiceMode && currentTools.length === 0;
					const showToolsForThisGroup = isLastGroup && currentTools.length > 0;
					const ratingId = groupRunId || groupId;
					const showRating = !readOnly && ratingId && threadId && group.role === "assistant" && combinedContent;
					const citations = group.messages.find(m => m.citations)?.citations;
					const displayRouteData = isLastGroup && routeDataForDisplay ? routeDataForDisplay : group.routeData;

					if (group.role === "user") {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
								{/* <div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
									<User className="size-6" />
								</div> */}
								<div className="group relative max-w-[85%]">
									<div className="p-5 text-base rounded-none shadow-sm bg-muted text-foreground leading-relaxed tracking-wide whitespace-pre-wrap">
										{group.messages.map(m => m.content).filter(Boolean).join(" ")}
									</div>
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

					return (
						<div key={`group-${groupIndex}`} data-testid="bot-message" className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
							<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
								<Bot className="size-6" />
							</div>
							<div className="group relative max-w-[85%] space-y-3">
								{group.toolMessages?.map((toolMsg) => {
									const toolData = toolMsg.content ? (() => {
										try {
											return JSON.parse(toolMsg.content);
										} catch {
											return { content: toolMsg.content };
										}
									})() : {};
									return (
										<HistoryToolCollapsible key={`history-tool-${toolMsg.id}`} name={toolMsg.toolName || "tool"} content={toolMsg.content} />
									);
								})}
								{showToolsForThisGroup && currentTools.map((tool) => (
									<ToolCollapsible key={`active-tool-${tool.id}`} tool={tool} />
								))}
								{displayRouteData && (
									<div className="animate-in fade-in slide-in-from-top-2 duration-300">
										<RouteMessage routeData={displayRouteData} />
									</div>
								)}
								{combinedContent && (
									<div className="p-5 text-base rounded-none shadow-sm transition-all duration-200 border bg-background border-border leading-relaxed tracking-wide">
										<div className="prose prose-base dark:prose-invert max-w-none [&_a]:text-blue-600 [&_a]:underline [&_a]:decoration-blue-400 [&_a]:hover:decoration-blue-600 [&_a]:font-medium">
											<Markdown remarkPlugins={[remarkGfm]}>
												{combinedContent}
											</Markdown>
										</div>
									</div>
								)}
								{showRating && (
									<div className="flex items-center gap-1 pl-2">
										<RatingButtons
											runId={ratingId || ""}
											threadId={threadId}
											agentId={agentId}
										/>
									</div>
								)}
								{citations && citations.length > 0 && (
									<div className="mt-2 p-3 bg-muted/50 rounded-lg border">
										<div className="text-xs font-semibold text-muted-foreground mb-2">Nguồn tham khảo</div>
										<div className="space-y-1">
											{citations.map((cite, idx) => (
												<div key={idx} data-testid="citation-item" className="text-xs">
													<span className="font-medium">[{idx + 1}]</span>{" "}
													<span className="text-primary">{cite.file_name}</span>
													<span className="text-muted-foreground"> - {cite.source_type}</span>
												</div>
											))}
										</div>
									</div>
								)}
							</div>
						</div>
					);
				})}

			{routeDataForDisplay && (
				<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
						<Bot className="size-6" />
					</div>
					<div className="flex-1 max-w-full">
						<MiniNavigation routeData={routeDataForDisplay} />
					</div>
				</div>
			)}

			{confirmationData && (
				<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
						<Bot className="size-6" />
					</div>
					<div className="flex-1 max-w-full">
						<ConfirmationOptions 
							data={confirmationData} 
							onSelect={(option) => {
								if (sendMessage) {
									sendMessage(option);
								}
							}}
						/>
					</div>
				</div>
			)}

			{landmarkData && (
				<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
					<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
						<Bot className="size-6" />
					</div>
					<div className="flex-1 max-w-full">
						<LandmarkCarousel 
							landmarks={landmarkData} 
							disabled={false}
							onConfirm={(landmark) => {
								if (sendMessage) {
									sendMessage(`Tôi đang ở ${landmark.name}`);
								}
							}}
						/>
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

				{voiceState === "connecting" && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<Loader2 className="size-5 animate-spin" />
						</div>
						<div className="flex-1 max-w-[85%] flex items-center">
							<span className="text-sm text-muted-foreground">Đang kết nối...</span>
						</div>
					</div>
				)}

				{voiceState === "connected" && isListening && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<div className="relative">
								<Bot className="size-6" />
								<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-400 rounded-full animate-pulse" />
							</div>
						</div>
						<div className="flex-1 max-w-[85%]">
							<VoiceLoadingIndicator isListening={true} />
						</div>
					</div>
				)}


			</div>
		</div>
	);
}
