"use client";

import React from "react";
import { Bot, User } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "@/services/agent";
import { AlertTriangle } from "lucide-react";

interface ChatWindowProps {
	messages: ChatMessage[];
	error: string | null;
}

export function ChatWindow({ messages, error }: ChatWindowProps) {
	return (
		<div className="flex-1 overflow-y-auto p-4 md:p-8">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
				{messages.map((m, index) => (
					<div key={`${m.id}-${index}`} className={`flex gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
						{m.role === "assistant" && (
							<div className="flex size-10 shrink-0 items-center justify-center bg-primary text-primary-foreground rounded-none shadow-sm">
								<Bot className="size-6" />
							</div>
						)}

						<div
							className={`max-w-[85%] p-4 text-sm rounded-none shadow-sm ${
								m.role === "user" ? "bg-muted text-foreground" : "border border-border bg-background"
							}`}
						>
							{m.role === "user" ? (
								<p className="whitespace-pre-wrap">{String(m.content)}</p>
							) : (
								<Markdown remarkPlugins={[remarkGfm]}>{String(m.content)}</Markdown>
							)}
						</div>

						{m.role === "user" && (
							<div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
								<User className="size-6" />
							</div>
						)}
					</div>
				))}

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
