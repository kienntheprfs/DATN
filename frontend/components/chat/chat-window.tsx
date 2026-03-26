"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, User, Square, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToolCall {
	id: string;
	name: string;
	status: "executing" | "done";
	content: string | null;
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
			<span className="text-sm text-muted-foreground">
				{isListening ? "Đang nghe..." : "Đang suy nghĩ..."}
			</span>
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
	const [isOpen, setIsOpen] = useState(true);

	let parsedContent: { query?: string; results?: any[]; content?: string } | null = null;
	let isJson = false;
	
	if (tool.content) {
		try {
			parsedContent = JSON.parse(tool.content);
			isJson = true;
		} catch {
			parsedContent = { content: tool.content };
		}
	}

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen} className="rounded-lg border border-blue-200 bg-blue-50/50 overflow-hidden">
			<CollapsibleTrigger asChild>
				<button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-100/50 transition-colors text-left">
					<ChevronDown
						className={`size-4 text-blue-600 transition-transform ${isOpen ? "" : "-rotate-90"}`}
					/>
					<div className="flex items-center gap-2">
						<div className="relative">
							<div className={`size-4 rounded-full border-2 border-blue-500 ${tool.status === "executing" ? "border-t-transparent animate-spin" : ""}`} />
						</div>
						<span className="text-sm text-blue-700 font-medium">
							{tool.name}
						</span>
					</div>
				</button>
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
											<span className="font-mono">{parsedContent.query}</span>
										</div>
									)}
									{parsedContent?.results && Array.isArray(parsedContent.results) && (
										<div className="space-y-1">
											<span className="font-semibold">Results ({parsedContent.results.length}):</span>
											{parsedContent.results.slice(0, 5).map((r: any, i: number) => (
												<div key={i} className="pl-2 border-l-2 border-blue-300 whitespace-pre-wrap">
													{r.title && <div className="font-medium">{r.title}</div>}
													<div className="text-blue-700/70 line-clamp-2">{r.content || r.snippet || JSON.stringify(r)}</div>
												</div>
											))}
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

interface GroupedMessages {
	role: "user" | "assistant";
	messages: ChatMessage[];
}

export function ChatWindow({ messages, error, isStreaming, isTyping, isVoiceMode, isListening, currentTools = [], partialText }: ChatWindowProps) {
	const isActive = isStreaming || isTyping;
	const scrollRef = useRef<HTMLDivElement>(null);
	
	const visibleMessages = messages;
	
	const lastBotMessage = visibleMessages.filter(m => m.role === "assistant").pop();
	const displayText = partialText || lastBotMessage?.content || "";
	const hasBotContent = lastBotMessage?.content && lastBotMessage.content.length > 0;
	const isThinking = isActive && !hasBotContent && !partialText && currentTools.length === 0;

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [visibleMessages]);

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

					if (showToolsForThisGroup && !combinedContent) {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
									<Bot className="size-6" />
								</div>
								<div className="flex-1 max-w-[85%] space-y-2">
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
							<div className="group relative max-w-[85%] space-y-2">
								{combinedContent && (
									<div className="p-4 text-sm rounded-none shadow-sm transition-all duration-200 border bg-background border-border">
										<div className="prose prose-sm dark:prose-invert max-w-none">
											<Markdown remarkPlugins={[remarkGfm]}>
												{combinedContent}
											</Markdown>
										</div>
									</div>
								)}
								{showToolsForThisGroup && currentTools.map((tool) => (
									<ToolCollapsible key={tool.id} tool={tool} />
								))}
							</div>
						</div>
					);
				})}

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

				{isVoiceMode && (
					<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
						<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
							<div className="relative">
								<Bot className="size-6" />
								<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-400 rounded-full animate-pulse" />
							</div>
						</div>
						<div className="flex-1 max-w-[85%]">
							{displayText ? (
								<div className="p-4 text-sm rounded-none shadow-sm transition-all duration-200 border border-border bg-background">
									<p className="whitespace-pre-wrap">
										{displayText}
										<ThinkingText />
									</p>
								</div>
							) : (
								<VoiceLoadingIndicator isListening={isListening || false} />
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
