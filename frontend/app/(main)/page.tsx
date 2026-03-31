"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { AudioLinesIcon, Paperclip, SlidersHorizontal, Send, BadgeCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { useVoice } from "@/hooks/use-voice";

import SuggestionSection from "@/components/page.suggest";
import { ChatInput } from "@/components/page.chatinput";
import { VoiceButton } from "@/components/voice-button";

export default function Home() {
	const router = useRouter();
	const [message, setMessage] = useState("");
	const [isListening, setIsListening] = useState(false);
	const [isSpeaking, setIsSpeaking] = useState(false);

	const voice = useVoice({
		apiGatewayUrl: "http://localhost:8002",
		agentId: "chatbot",
		onTranscript: (text) => {
			if (text.trim()) {
				setMessage((prev) => prev ? `${prev} ${text}` : text);
			}
		},
		onError: (err) => console.error("Voice error:", err),
	});

	const handleVoiceStateChange = () => {
		router.push("/chat?voice=true");
	};

	const handleSend = () => {
		if (message.trim()) {
			router.push(`/chat?q=${encodeURIComponent(message)}`);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	return (
		<div className="flex flex-col items-center justify-center w-full min-h-[85vh] px-4">
			<div className="flex w-full max-w-3xl flex-col items-center gap-8">
				<div className="flex flex-col items-center gap-4 mt-3">
					<Badge className="flex items-center gap-1.5 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-200">
						<BadgeCheckIcon className="size-10 fill-accent" />
						CƠ SỞ DỮ LIỆU CHÍNH THỐNG
					</Badge>
					<h1 className="text-3xl font-bold tracking-tight text-center sm:text-4xl text-foreground">Hệ thống Hỗ trợ sinh viên tra cứu văn bản</h1>
					<p className="max-w-2xl text-lg text-center text-muted-foreground">
						Truy cập nhanh vào cơ sờ dữ liệu văn bàn pháp quy, quy chế đào tạo và quyết định hành chính của trường ĐH Bách Khoa.
					</p>
				</div>

				<div className="flex w-full flex-col overflow-hidden border border-border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50 rounded-none">
					<InputGroupTextarea
						id="chat-textarea"
						placeholder="Nhập câu hỏi hoặc yêu cầu tra cứu..."
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyDown={handleKeyDown}
					/>

					<div className="flex items-center justify-between bg-muted/20 px-3 pb-3 pt-1">
						<div className="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground">
										<Paperclip className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Đính kèm tài liệu</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button variant="ghost" size="icon" className="size-9 rounded-none text-muted-foreground hover:bg-muted hover:text-foreground">
										<SlidersHorizontal className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Cấu hình tra cứu</TooltipContent>
							</Tooltip>
						</div>

						<div className="flex items-center gap-1">
							<VoiceButton
								apiGatewayUrl="http://localhost:8002"
								agentId="chatbot"
								externalState={voice.state}
								externalIsListening={isListening}
								externalIsSpeaking={isSpeaking}
								onToggle={handleVoiceStateChange}
							/>

							<Button
								variant="default"
								className="rounded-none font-bold"
								onClick={handleSend}
							>
								<Send className="mr-2 size-4" />
								Tra cứu
							</Button>
						</div>
					</div>
				</div>

				<SuggestionSection />

				<footer className="max-w-2xl text-sm text-center text-muted-foreground mb-3">
					<p>Hệ thống sử dụng Al để hỗ trợ tra cứu. Vui lòng kiểm tra lại văn bản gốc trước khi áp dụng.</p>
					<p>@ 2026 Nhóm đồ án HTK.</p>
				</footer>
			</div>
		</div>
	);
}
