"use client";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { AudioLinesIcon, Paperclip, SlidersHorizontal, Send, BadgeCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import SuggestionSection from "@/components/page.suggest";
import { ChatInput } from "@/components/page.chatinput";

export default function Home() {
	return (
		// 1. OUTER WRAPPER: Căn giữa toàn bộ màn hình theo cả chiều dọc và ngang
		<div className="flex flex-col items-center justify-center w-full min-h-[85vh] px-4">
			{/* 2. INNER WRAPPER: Giới hạn chiều rộng (max-w-3xl) để khung chat không bị bè ra hai bên */}
			<div className="flex w-full max-w-3xl flex-col items-center gap-8">
				{/* --- PHẦN TIÊU ĐỀ & BADGE --- */}
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

				<ChatInput />

				<SuggestionSection />

				<footer className="max-w-2xl text-sm text-center text-muted-foreground mb-3">
					<p>Hệ thống sử dụng Al để hỗ trợ tra cứu. Vui lòng kiểm tra lại văn bản gốc trước khi áp dụng.</p>
					<p>@ 2026 Nhóm đồ án HTK.</p>
				</footer>
			</div>
		</div>
	);
}
