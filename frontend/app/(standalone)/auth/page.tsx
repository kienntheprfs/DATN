"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GraduationCap } from "lucide-react";

export default function AuthPage() {
	const [isLogin, setIsLogin] = useState(true);
	const [showPassword, setShowPassword] = useState(false);

	return (
		<div className="h-screen flex flex-col md:flex-row overflow-hidden bg-background-light">
			{/* Left Side - Academic Banner */}
			<section className="hidden md:block md:w-2/3 h-full relative bg-academic-overlay">
				<div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
					<div className="max-w-xl">
						<div className="w-16 h-1 bg-white mb-6"></div>
						<h2 className="font-heading text-4xl mb-4 leading-tight">Đại học Bách Khoa - ĐHQG-HCM</h2>
						<p className="text-lg opacity-90 font-light tracking-wide">
							Kiến tạo tri thức, phục vụ cộng đồng và dẫn đầu trong nghiên cứu khoa học tại Việt Nam.
						</p>
					</div>
				</div>
			</section>

			{/* Right Side - Auth Form */}
			<main className="w-full md:w-1/3 h-full flex flex-col bg-surface border-l border-border shadow-2xl relative z-10 overflow-y-auto">
				<div className="flex-1 flex flex-col justify-center px-8 md:px-10 py-12">
					<div className="w-full max-w-md mx-auto">
						{/* Logo & Title */}
						<div className="text-center mb-10">
							<div className="inline-flex items-center justify-center w-20 h-20 bg-primary text-white rounded-sm mb-6 shadow-md">
								<GraduationCap className="size-10 fill-current" />
							</div>
							<h1 className="font-heading text-text-main tracking-tight mb-3 text-4xl font-bold">Academic Nexus</h1>
							<p className="text-text-secondary text-lg">Hệ thống Tra cứu Quy chế & Văn bản</p>
						</div>

						{/* Tabs */}
						<div className="flex border-b border-gray-200 mb-8">
							<button
								onClick={() => setIsLogin(true)}
								className={`flex-1 pb-3 text-center font-semibold transition-colors ${
									isLogin ? "text-primary border-b-2 border-primary" : "text-text-secondary hover:text-text-main"
								}`}
							>
								Đăng nhập
							</button>
							<button
								onClick={() => setIsLogin(false)}
								className={`flex-1 pb-3 text-center font-semibold transition-colors ${
									!isLogin ? "text-primary border-b-2 border-primary" : "text-text-secondary hover:text-text-main"
								}`}
							>
								Đăng ký
							</button>
						</div>

						{/* Form */}
						<form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
							{!isLogin && (
								<div className="space-y-3">
									<Label className="block font-bold uppercase text-text-secondary tracking-widest text-[14px]" htmlFor="fullname">
										Họ và tên
									</Label>
									<div className="relative group">
										<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
											<span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[24px]">person</span>
										</div>
										<Input
											id="fullname"
											name="fullname"
											placeholder="Nguyễn Văn A"
											className="pl-12 pr-4 py-3.5 border-slate-300 rounded-sm text-lg font-medium focus:ring-primary focus:border-primary"
										/>
									</div>
								</div>
							)}

							<div className="space-y-3">
								<Label className="block font-bold uppercase text-text-secondary tracking-widest text-[14px]" htmlFor="email">
									Email sinh viên / Cán bộ
								</Label>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[24px]">mail</span>
									</div>
									<Input
										id="email"
										name="email"
										type="email"
										placeholder="ten.ho@hcmut.edu.vn"
										className="pl-12 pr-4 py-3.5 border-slate-300 rounded-sm text-lg font-medium focus:ring-primary focus:border-primary"
									/>
								</div>
							</div>

							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<Label className="block font-bold uppercase text-text-secondary tracking-widest text-[14px]" htmlFor="password">
										Mật khẩu
									</Label>
									{isLogin && (
										<a className="text-primary hover:underline font-bold text-sm" href="#">
											Quên mật khẩu?
										</a>
									)}
								</div>
								<div className="relative group">
									<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
										<span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[24px]">lock</span>
									</div>
									<Input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										placeholder="••••••••"
										className="pl-12 pr-12 py-3.5 border-slate-300 rounded-sm text-lg font-medium focus:ring-primary focus:border-primary"
									/>
									<button
										type="button"
										onClick={() => setShowPassword(!showPassword)}
										className="absolute inset-y-0 right-0 pr-4 flex items-center"
									>
										<span className="material-symbols-outlined text-slate-400 hover:text-slate-600">
											{showPassword ? "visibility_off" : "visibility"}
										</span>
									</button>
								</div>
							</div>

							{!isLogin && (
								<div className="space-y-3">
									<Label className="block font-bold uppercase text-text-secondary tracking-widest text-[14px]" htmlFor="confirmPassword">
										Xác nhận mật khẩu
									</Label>
									<div className="relative group">
										<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
											<span className="material-symbols-outlined text-slate-400 group-focus-within:text-primary text-[24px]">lock</span>
										</div>
										<Input
											id="confirmPassword"
											name="confirmPassword"
											type={showPassword ? "text" : "password"}
											placeholder="••••••••"
											className="pl-12 pr-4 py-3.5 border-slate-300 rounded-sm text-lg font-medium focus:ring-primary focus:border-primary"
										/>
									</div>
								</div>
							)}

							{!isLogin && (
								<div className="flex items-center gap-2">
									<Checkbox id="terms" />
									<Label htmlFor="terms" className="text-sm text-text-secondary cursor-pointer">
										Tôi đồng ý với{" "}
										<a href="#" className="text-primary hover:underline font-medium">
											Điều khoản
										</a>{" "}
										và{" "}
										<a href="#" className="text-primary hover:underline font-medium">
											Chính sách bảo mật
										</a>
									</Label>
								</div>
							)}

							<Button
								type="submit"
								className="mt-2 w-full flex justify-center items-center gap-3 py-3.5 px-4 border border-slate-300 rounded-sm shadow-sm font-bold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all active:scale-[0.98] text-lg"
							>
								{isLogin ? "Đăng nhập" : "Đăng ký"}
							</Button>
						</form>

						{/* Divider */}
						<div className="relative my-9">
							<div className="absolute inset-0 flex items-center">
								<div className="w-full border-t border-slate-300"></div>
							</div>
							<div className="relative flex justify-center text-sm">
								<span className="px-4 bg-surface text-text-secondary font-bold uppercase tracking-widest text-[13px]">Hoặc</span>
							</div>
						</div>

						{/* Google Login */}
						<Button
							type="button"
							className="w-full flex justify-center items-center gap-3 py-3.5 px-4 border border-slate-300 rounded-sm shadow-sm font-bold text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-all text-lg"
						>
							<svg height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg">
								<path
									d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
									fill="#4285F4"
								></path>
								<path
									d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
									fill="#34A853"
								></path>
								<path
									d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
									fill="#FBBC05"
								></path>
								<path
									d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
									fill="#EA4335"
								></path>
							</svg>
							{isLogin ? "Đăng nhập bằng Google" : "Đăng ký bằng Google"}
						</Button>

						{/* Guest Access */}
						<Link href="/">
							<Button
								type="button"
								className="mt-4 w-full flex justify-center items-center gap-2 py-3.5 px-4 border border-slate-300 rounded-sm shadow-sm font-bold text-text-main bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 transition-colors text-lg"
							>
								Truy cập với vai trò Khách
							</Button>
						</Link>
					</div>
				</div>

				{/* Footer */}
				<footer className="px-8 py-8 border-t border-border bg-slate-50 mt-auto">
					<div className="text-center text-text-secondary space-y-3 text-[15px]">
						<p className="font-extrabold text-slate-800 uppercase tracking-tighter text-lg">Trường Đại học Bách Khoa - ĐHQG-HCM</p>
						<p className="font-medium">© 2026 Academic Nexus. Phiên bản 2.0.1</p>
						<div className="flex justify-center gap-5 mt-4 font-semibold text-sm">
							<a className="hover:text-primary transition-colors" href="#">
								Điều khoản
							</a>
							<span className="text-slate-300">|</span>
							<a className="hover:text-primary transition-colors" href="#">
								Trợ giúp
							</a>
							<span className="text-slate-300">|</span>
							<a className="hover:text-primary transition-colors" href="#">
								Liên hệ P.ĐT
							</a>
						</div>
					</div>
				</footer>
			</main>

			{/* Decorative Element */}
			<div className="fixed bottom-0 right-0 p-4 pointer-events-none opacity-[0.03] hidden lg:block">
				<svg fill="none" height="120" viewBox="0 0 400 200" width="240" xmlns="http://www.w3.org/2000/svg">
					<rect fill="#030391" height="180" width="60" x="50" y="20"></rect>
					<rect fill="#030391" height="150" width="60" x="130" y="50"></rect>
					<rect fill="#030391" height="120" width="60" x="210" y="80"></rect>
					<rect fill="#030391" height="90" width="60" x="290" y="110"></rect>
				</svg>
			</div>
		</div>
	);
}
