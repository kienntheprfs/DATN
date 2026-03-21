"use client";
import { InputGroupTextarea } from "@/components/ui/input-group";
import { AudioLinesIcon, Paperclip, SlidersHorizontal, Send, BadgeCheckIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

import SuggestionSection from "@/components/page.suggest";

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

				{/* --- PHẦN KHUNG NHẬP LIỆU (CHAT BOX) --- */}
				{/* Bọc toàn bộ Input và Button vào 1 cái viền to, có bóng mờ */}
				<div className="flex w-full flex-col overflow-hidden border bg-background shadow-md transition-all focus-within:ring-2 focus-within:ring-primary/50">
					{/* Hàng 1: Ô nhập text và Icon Voice */}
					<InputGroupTextarea id="block-end-textarea" placeholder="Write a comment..." />

					{/* Hàng 2: Các công cụ (Đính kèm, Cài đặt) và Nút Gửi */}
					<div className="flex items-center justify-between bg-muted/20 px-3 pb-3 pt-1">
						<div className="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
									>
										<Paperclip className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Đính kèm tài liệu</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="ghost"
										size="icon"
										className="size-9 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
									>
										<SlidersHorizontal className="size-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Cấu hình tra cứu</TooltipContent>
							</Tooltip>
						</div>

						<div className="flex items-center gap-1">
							<Tooltip>
								<TooltipTrigger asChild>
									{/* TooltipTrigger giờ bọc trực tiếp Button, hoàn toàn không bị lỗi Hydration */}
									<Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10">
										<AudioLinesIcon className="size-5" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Tìm kiếm bằng giọng nói</TooltipContent>
							</Tooltip>

							{/* Nút Tra cứu*/}
							<Button variant="default">
								<Send className="mr-2 size-4" />
								Tra cứu
							</Button>
						</div>
					</div>
				</div>

				<SuggestionSection />

				<div className="max-w-2xl text-sm text-center text-muted-foreground mb-3">
					<p>Hệ thống sử dụng Al để hỗ trợ tra cứu. Vui lòng kiểm tra lại văn bản gốc trước khi áp dụng.</p>
					<p>@ 2026 Nhóm đồ án HTK.</p>
				</div>
			</div>
		</div>
	);
}
