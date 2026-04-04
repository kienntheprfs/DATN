"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
	Mail,
	Phone,
	MapPin,
	Lock,
	Bell,
	BarChart3,
	CheckCircle2,
	Shield,
	FileText,
	History,
	Bookmark,
	Camera,
	Building2,
	Info,
	LogOut,
	Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authService } from "@/services/auth-api";
import type { User } from "@/types";

export default function ProfilePage() {
	const router = useRouter();
	const [user, setUser] = useState<User | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [notifications, setNotifications] = useState({
		email: true,
		system: true,
	});

	useEffect(() => {
		const loadUser = async () => {
			try {
				const userData = await authService.me();
				setUser(userData);
			} catch {
				router.push("/auth");
			} finally {
				setIsLoading(false);
			}
		};

		loadUser();
	}, [router]);

	const handleLogout = async () => {
		await authService.logout();
		router.push("/auth");
	};

	const getInitials = (name: string | undefined, email: string) => {
		if (name) {
			return name
				.split(" ")
				.map((n) => n[0])
				.join("")
				.toUpperCase()
				.slice(0, 2);
		}
		return email[0]?.toUpperCase() || "U";
	};

	const getDisplayName = () => {
		return user?.display_name || user?.email.split("@")[0] || "Người dùng";
	};

	const getRoleLabel = () => {
		if (!user) return "Người dùng";
		if (user.is_superuser) return "Quản trị viên";
		if (user.roles && user.roles.length > 0) {
			const roleNames = user.roles.map((r) => {
				if (r.name === "user") return "Người dùng";
				if (r.name === "admin") return "Quản trị viên";
				if (r.name === "moderator") return "Điều hành viên";
				return r.name;
			});
			return roleNames.join(", ");
		}
		return "Người dùng";
	};

	if (isLoading) {
		return (
			<div className="flex-1 overflow-auto p-6">
				<div className="max-w-350 mx-auto w-full space-y-6">
					<Card>
						<CardContent className="p-8">
							<div className="flex flex-col md:flex-row gap-6 items-start">
								<Skeleton className="w-28 h-28 rounded-2xl" />
								<div className="space-y-3 flex-1">
									<Skeleton className="h-8 w-48" />
									<Skeleton className="h-4 w-64" />
									<Skeleton className="h-6 w-32" />
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</div>
		);
	}

	if (!user) {
		return null;
	}

	return (
		<div className="flex-1 overflow-auto p-3">
			<div className="max-w-350 mx-auto w-full space-y-6">
				{/* Profile Header */}
				<Card className="border-primary/20 bg-linear-to-r from-primary to-primary/90 text-primary-foreground overflow-hidden">
					<CardContent className="p-8">
						<div className="flex flex-col md:flex-row gap-6 items-start">
							<div className="relative">
								{user.avatar_url ? (
									<img
										src={user.avatar_url}
										alt=""
										className="w-28 h-28 rounded-2xl object-cover border-4 border-primary-foreground/30 shadow-2xl"
									/>
								) : (
									<div className="w-28 h-28 rounded-2xl bg-primary-foreground/20 backdrop-blur-sm flex items-center justify-center text-4xl font-bold border-4 border-primary-foreground/30 shadow-2xl">
										{getInitials(user.display_name, user.email)}
									</div>
								)}
								<Button size="icon" variant="secondary" className="absolute -bottom-2 -right-2 rounded-xl shadow-lg">
									<Camera className="h-5 w-5" />
								</Button>
							</div>
							<div className="flex-1 pt-2">
								<div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
									<div className="space-y-2">
										<h1 className="text-3xl font-bold tracking-tight">{getDisplayName()}</h1>
										<div className="flex flex-wrap items-center gap-3">
											<Badge
												variant="secondary"
												className="bg-primary-foreground/20 text-primary-foreground border-primary-foreground/30"
											>
												{getRoleLabel()}
											</Badge>
											{user.is_superuser && (
												<Badge className="bg-amber-500 text-white">
													<Shield className="h-3 w-3 mr-1" />
													Quản trị viên
												</Badge>
											)}
										</div>
										<Badge
											variant="secondary"
											className="text-sm font-mono bg-primary-foreground/10 border-primary-foreground/20 text-white"
										>
											ID: {user.id}
										</Badge>
									</div>
									<div className="flex gap-3 pt-2">
										<Button
											variant="secondary"
											className="bg-primary-foreground/20 hover:bg-primary-foreground/30 text-primary-foreground border-primary-foreground/30"
										>
											<Lock className="h-4 w-4 mr-2" />
											Đổi mật khẩu
										</Button>
										<Button
											variant="outline"
											className="border-red-500 text-red-500 hover:bg-red-500 hover:text-white"
											onClick={handleLogout}
										>
											<LogOut className="h-4 w-4 mr-2" />
											Đăng xuất
										</Button>
									</div>
								</div>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Main Content */}
				<div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
					{/* Tabs Section - chiếm 3 phần */}
					<div className="xl:col-span-4">
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-3">
									<div className="p-2 bg-primary/10 rounded-lg">
										<Mail className="h-5 w-5 text-primary" />
									</div>
									Thông tin liên hệ
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-6">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<Label htmlFor="email">Email</Label>
										<InputGroup>
											<InputGroupAddon align="inline-start">
												<Mail className="h-4 w-4 text-muted-foreground" />
											</InputGroupAddon>
											<InputGroupInput id="email" disabled value={user.email} />
										</InputGroup>
										<p className="text-xs text-muted-foreground flex items-center gap-1">
											<Lock className="h-3 w-3" />
											Email chính thức không thể thay đổi
										</p>
									</div>
									<div className="space-y-2">
										<Label htmlFor="provider">Đăng nhập qua</Label>
										<InputGroup>
											<InputGroupAddon align="inline-start">
												<Shield className="h-4 w-4 text-muted-foreground" />
											</InputGroupAddon>
											<InputGroupInput id="provider" disabled value={user.auth_provider === "google" ? "Google" : "Tài khoản local"} />
										</InputGroup>
									</div>
									<div className="space-y-2">
										<Label htmlFor="status">Trạng thái</Label>
										<InputGroup>
											<InputGroupAddon align="inline-start">
												<CheckCircle2 className="h-4 w-4 text-green-500" />
											</InputGroupAddon>
											<InputGroupInput id="status" disabled value={user.is_active ? "Hoạt động" : "Không hoạt động"} />
										</InputGroup>
									</div>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-3">
									<div className="p-2 bg-primary/10 rounded-lg">
										<Lock className="h-5 w-5 text-primary" />
									</div>
									Bảo mật
								</CardTitle>
							</CardHeader>
							<CardContent className="space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
									<div className="space-y-2">
										<Label htmlFor="current-pwd">Mật khẩu hiện tại</Label>
										<InputGroup>
											<InputGroupAddon align="inline-start">
												<Lock className="h-4 w-4 text-muted-foreground" />
											</InputGroupAddon>
											<InputGroupInput id="current-pwd" type="password" placeholder="Nhập mật khẩu hiện tại" />
										</InputGroup>
									</div>
									<div className="space-y-2">
										<Label htmlFor="new-pwd">Mật khẩu mới</Label>
										<InputGroup>
											<InputGroupAddon align="inline-start">
												<Lock className="h-4 w-4 text-muted-foreground" />
											</InputGroupAddon>
											<InputGroupInput id="new-pwd" type="password" placeholder="Nhập mật khẩu mới" />
										</InputGroup>
									</div>
								</div>
								<div className="flex items-start gap-2 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
									<Info className="h-4 w-4 mt-0.5 shrink-0" />
									<span>Mật khẩu phải có ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số</span>
								</div>
							</CardContent>
						</Card>
					</div>
				</div>
			</div>
		</div>
	);
}
