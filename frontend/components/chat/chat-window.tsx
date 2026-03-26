"use client";

import React, { useMemo } from "react";
import { Bot, User, Square, Loader2, Mic, MicOff } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatWindowProps {
	messages: ChatMessage[];
	error: string | null;
	isStreaming?: boolean;
	isTyping?: boolean;
	isListening?: boolean;
	isSpeaking?: boolean;
	onStop?: () => void;
}

function TypingIndicator() {
	return (
		<div className="flex items-center gap-1 p-3">
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

function VoiceThinkingIndicator({ isListening, isSpeaking }: { isListening: boolean; isSpeaking: boolean }) {
	if (!isListening && !isSpeaking) return null;
	
	return (
		<div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-none border border-dashed border-primary/30">
			<div className="flex gap-1">
				<span className={`size-2 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-primary"} animate-bounce`} style={{ animationDelay: "0ms" }} />
				<span className={`size-2 rounded-full ${isListening || isSpeaking ? "bg-primary animate-bounce" : "bg-muted-foreground"}`} style={{ animationDelay: "150ms" }} />
				<span className={`size-2 rounded-full ${isSpeaking ? "bg-red-500 animate-pulse" : "bg-primary animate-bounce"}`} style={{ animationDelay: "300ms" }} />
			</div>
			<span className="text-xs text-muted-foreground">
				{isSpeaking ? "Đang nói..." : isListening ? "Đang nghe..." : ""}
			</span>
		</div>
	);
}

interface GroupedMessages {
	role: "user" | "assistant";
	messages: ChatMessage[];
}

export function ChatWindow({ messages, error, isStreaming, isTyping, isListening, isSpeaking, onStop }: ChatWindowProps) {
	const isVoiceActive = isListening || isSpeaking;
	
	const groupedMessages = useMemo(() => {
		const groups: GroupedMessages[] = [];
		
		for (const m of messages) {
			const lastGroup = groups[groups.length - 1];
			if (lastGroup && lastGroup.role === m.role && m.role === "assistant") {
				lastGroup.messages.push(m);
			} else {
				groups.push({ role: m.role, messages: [m] });
			}
		}
		
		return groups;
	}, [messages]);

	const lastMessage = messages[messages.length - 1];
	const isLastFromAssistant = lastMessage?.role === "assistant";

	return (
		<div className="flex-1 overflow-y-auto p-4 md:p-8">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
				{isVoiceActive && (
					<div className="sticky top-0 z-10 flex justify-center pb-2">
						<VoiceThinkingIndicator isListening={isListening} isSpeaking={isSpeaking} />
					</div>
				)}
				
				{groupedMessages.map((group, groupIndex) => {
					const isLastGroup = groupIndex === groupedMessages.length - 1;
					const isActive = isLastGroup && ((isStreaming || isTyping) || isVoiceActive);
					
					if (group.role === "user") {
						return (
							<div key={`group-${groupIndex}`} className="flex gap-4 justify-end animate-in fade-in slide-in-from-bottom-2 duration-300">
								<div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
									<User className="size-6" />
								</div>
								<div className="group relative max-w-[85%] space-y-2">
									{group.messages.map((m, msgIndex) => (
										<div key={m.id} className="p-4 text-sm rounded-none shadow-sm bg-muted text-foreground">
											<p className="whitespace-pre-wrap">{String(m.content)}</p>
										</div>
									))}
								</div>
							</div>
						);
					}
					
					const combinedContent = group.messages.map(m => m.content).filter(Boolean).join(" ");
					
					return (
						<div key={`group-${groupIndex}`} className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
							<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
								{isActive ? (
									<div className="relative">
										<Bot className="size-6" />
										<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-400 rounded-full animate-pulse" />
									</div>
								) : (
									<Bot className="size-6" />
								)}
							</div>
							<div className="group relative max-w-[85%]">
								<div className={`p-4 text-sm rounded-none shadow-sm transition-all duration-200 border border-border bg-background ${isVoiceActive ? "animate-pulse bg-muted/30" : ""}`}>
									<div className="prose prose-sm dark:prose-invert max-w-none">
										<Markdown
											remarkPlugins={[remarkGfm]}
											components={{
												p: ({ children }) => (
													<p className="mb-2 last:mb-0">
														{children}
														{isActive && typeof children === "string" && (
															<StreamingCursor />
														)}
													</p>
												),
											}}
										>
											{combinedContent}
										</Markdown>
										{isActive && !combinedContent && (
											<span className="text-muted-foreground italic">...</span>
										)}
									</div>
									
									{isActive && onStop && (
										<div className="absolute -top-3 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
											<Button
												size="sm"
												variant="secondary"
												className="h-7 rounded-none shadow-md text-xs gap-1"
												onClick={onStop}
											>
												<Square className="size-3" />
												Dừng
											</Button>
										</div>
									)}
								</div>
								
								{isActive && (
									<TypingIndicator />
								)}
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
			</div>
		</div>
	);
}
