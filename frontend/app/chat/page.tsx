"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import remarkGfm from "remark-gfm";
import { AlertTriangle, Bot, User } from "lucide-react";
import { ChatInput } from "@/components/page.chatinput";
import Markdown from "react-markdown";

export default function ChatPage() {
	const searchParams = useSearchParams();
	const initialQuery = searchParams.get("q");
	const hasAppended = useRef(false);

	// --- CẤU HÌNH USECHAT CHUẨN V5 MỚI NHẤT ---
	const { messages, sendMessage, status, error } = useChat({
		// Khai báo Transport thay vì ghi api trực tiếp
		transport: new DefaultChatTransport({
			// Trỏ thẳng sang API Backend FastAPI của bạn
			api: "http://localhost:8080/api/v1/chat",

			// Cách bạn gắn Token hoặc Header y chang như xài Axios Interceptor
			headers: {
				// 'Authorization': `Bearer TOKEN_CỦA_BẠN`,
				"X-Client-Platform": "BK-TBOT",
			},

			// Nếu bạn cần cấu hình fetch sâu hơn (như lấy credentials)
			// fetch: customFetchFunction,
		}),
	});

	const isProcessing = status === "submitted" || status === "streaming";

	useEffect(() => {
		if (initialQuery && !hasAppended.current) {
			hasAppended.current = true;
			sendMessage({ text: initialQuery });
		}
	}, [initialQuery, sendMessage]);

	return (
		<div className="flex h-screen w-full flex-col bg-background">
			{/* --- KHU VỰC TIN NHẮN CHAT --- */}
			<div className="flex-1 overflow-y-auto p-4 md:p-8">
				<div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
					{messages.map((m) => {
						// Lấy text chuẩn v5
						const textContent = m.parts?.map((part) => (part.type === "text" ? part.text : "")).join("") || "";

						return (
							<div key={m.id} className={`flex gap-4 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
									{/* --- RENDER TIN NHẮN CỦA USER --- */}
									{m.role === "user" && <p className="whitespace-pre-wrap">{textContent}</p>}

									{/* --- RENDER TIN NHẮN CỦA BOT (MARKDOWN) --- */}
									{m.role !== "user" && <Markdown remarkPlugins={[remarkGfm]}>{textContent}</Markdown>}
								</div>

								{m.role === "user" && (
									<div className="flex size-10 shrink-0 items-center justify-center bg-secondary text-secondary-foreground rounded-none shadow-sm">
										<User className="size-6" />
									</div>
								)}
							</div>
						);
					})}
					{/* --- BONG BÓNG BÁO LỖI (CHỈ HIỆN KHI CÓ LỖI) --- */}
					{error && (
						<div className="flex gap-4 justify-start animate-in fade-in slide-in-from-bottom-2">
							<div className="flex size-10 shrink-0 items-center justify-center bg-red-600 text-white rounded-none shadow-sm">
								<AlertTriangle className="size-5" />
							</div>

							<div className="max-w-[85%] p-4 text-sm rounded-none shadow-sm border border-red-500 bg-red-50 text-red-700">
								<p className="font-bold mb-1">Ối, hệ thống gặp sự cố rồi!</p>
								<p>Không thể kết nối đến máy chủ. Vui lòng thử lại sau. (Chi tiết: {error.message})</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* --- KHU VỰC NHẬP LIỆU --- */}
			<div className="border-t border-border bg-background p-4">
				<div className="mx-auto w-full max-w-4xl">
					<ChatInput isLoading={isProcessing} onSubmitMessage={(msg) => sendMessage({ text: msg })} />
				</div>
			</div>
		</div>
	);
}
