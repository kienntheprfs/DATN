"use client";

import { useRouter } from "next/navigation";
import { BadgeCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// import SuggestionSection from "@/components/page.suggest";
import { ChatInput, QueryMode } from "@/components/page.chatinput";

export default function Home() {
	const router = useRouter();

	const handleVoiceToggle = () => {
		const threadId = crypto.randomUUID();
		const params = new URLSearchParams({ thread_id: threadId, voice: "true" });
		router.push(`/chat?${params.toString()}`);
	};

	const handleSubmitAndRedirect = (message: string, queryMode?: QueryMode) => {
		const threadId = crypto.randomUUID();
		const params = new URLSearchParams({
			thread_id: threadId,
			message: message,
		});
		if (queryMode === "deep") {
			params.set("query_mode", "deep");
		}
		router.push(`/chat?${params.toString()}`);
	};

	return (
		<div className="flex flex-col items-center justify-between w-full flex-1 px-4 py-6">
			<div className="flex w-full max-w-3xl flex-col justify-center flex-1 gap-14 sm:gap-20">
				<div className="flex flex-col items-center gap-4">
					<Badge className="flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-3 text-sm font-semibold text-blue-800 hover:bg-blue-100">
						<BadgeCheckIcon className="size-10 fill-accent" />
						CƠ SỞ DỮ LIỆU CHÍNH THỐNG
					</Badge>
					<h1 className="text-3xl font-bold tracking-tight text-center sm:text-4xl text-[#030391]">Hệ thống Hỏi-Đáp hỗ trợ sinh viên</h1>
					<p className="max-w-2xl text-lg text-center text-muted-foreground">
						Cung cấp thông tin về quy chế - quy định học vụ, tuyển sinh hiện hành của Trường Đại học Bách khoa - ĐHQG TPHCM
					</p>
				</div>

				<div className="w-full flex flex-col gap-2 mt-6 sm:mt-10">
					<ChatInput
						voiceAgentId="chatbot"
						onVoiceToggle={handleVoiceToggle}
						onSubmitAndRedirect={handleSubmitAndRedirect}
					/>
				</div>

				{/* <SuggestionSection /> */}
			</div>

			<div className="max-w-3xl text-xs text-center text-muted-foreground/80 leading-relaxed mt-8">
				<p>Hệ thống sử dụng AI để hỗ trợ tra cứu. Vui lòng kiểm tra lại văn bản gốc trước khi áp{"\u00a0"}dụng.</p>
				<p className="mt-1">@ 2026 Nhóm đồ án HTK.</p>
			</div>
		</div>
	);
}
