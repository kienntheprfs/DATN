"use client";

import React from "react";
import { Bot, User, Square, Loader2 } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatWindowProps {
	messages: ChatMessage[];
	error: string | null;
	isStreaming?: boolean;
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

export function ChatWindow({ messages, error, isStreaming, onStop }: ChatWindowProps) {
	const lastMessage = messages[messages.length - 1];
	const isLastMessageFromAssistant = lastMessage?.role === "assistant" && isStreaming;

	return (
		<div className="flex-1 overflow-y-auto p-4 md:p-8">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				{messages.map((m, index) => {
					const isLastAssistant = m.role === "assistant" && index === messages.length - 1 && isStreaming;

					return (
						<div
							key={`${m.id}-${index}`}
							className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
								m.role === "user" ? "justify-end" : "justify-start"
							}`}
						>
							{m.role === "assistant" && (
								<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
									{isLastAssistant ? (
										<div className="relative">
											<Bot className="size-6" />
											<span className="absolute -top-0.5 -right-0.5 size-2 bg-green-400 rounded-full animate-pulse" />
										</div>
									) : (
										<Bot className="size-6" />
									)}
								</div>
							)}

							<div className="group relative max-w-[85%]">
								<div
									className={`p-4 text-sm rounded-none shadow-sm transition-all duration-200 ${
										m.role === "user"
											? "bg-muted text-foreground"
											: "border border-border bg-background"
									}`}
								>
									{m.role === "user" ? (
										<p className="whitespace-pre-wrap">{String(m.content)}</p>
									) : (
										<div className="prose prose-sm dark:prose-invert max-w-none">
											<Markdown
												remarkPlugins={[remarkGfm]}
												components={{
													p: ({ children }) => (
														<p className="mb-2 last:mb-0">
															{children}
															{isLastAssistant && typeof children === "string" && (
																<StreamingCursor />
															)}
														</p>
													),
												}}
											>
												{String(m.content)}
											</Markdown>
											{isLastAssistant && !String(m.content).endsWith("</p>") && (
												<StreamingCursor />
											)}
										</div>
									)}

									{isLastAssistant && onStop && (
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

								{isLastAssistant && (
									<TypingIndicator />
								)}
							</div>

							{m.role === "user" && (
								<div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
									<User className="size-6" />
								</div>
							)}
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
