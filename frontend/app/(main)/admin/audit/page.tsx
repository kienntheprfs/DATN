"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
	Shield,
	Search,
	Filter,
	Download,
	Calendar,
	User,
	Activity,
	Clock,
	ChevronLeft,
	ChevronRight,
	Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { auditService, type AuditLog, type AuditLogFilters } from "@/services/audit-api";
import { authService } from "@/services/auth-api";
import type { User as UserType } from "@/types";

const SERVICE_OPTIONS = [
	{ value: "all", label: "Tất cả dịch vụ" },
	{ value: "wayfinder", label: "Wayfinder" },
	{ value: "knowledge", label: "Knowledge" },
	{ value: "dashboard", label: "Dashboard" },
	{ value: "api_gateway", label: "API Gateway" },
];

const ACTION_COLORS: Record<string, string> = {
	create: "bg-green-500",
	update: "bg-blue-500",
	delete: "bg-red-500",
	view: "bg-gray-500",
};

export default function AuditLogsPage() {
	const router = useRouter();
	const [user, setUser] = useState<UserType | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [logs, setLogs] = useState<AuditLog[]>([]);
	const [isLoadingLogs, setIsLoadingLogs] = useState(false);
	const [selectedService, setSelectedService] = useState("all");
	const [searchAction, setSearchAction] = useState("");
	const [filters, setFilters] = useState<AuditLogFilters>({
		limit: 20,
		offset: 0,
	});
	const [total, setTotal] = useState(0);

	useEffect(() => {
		const checkAuth = async () => {
			try {
				const userData = await authService.me();
				setUser(userData);
				
				const isAdmin = userData.roles?.some((r) => r.name === "admin") || userData.is_superuser;
				if (!isAdmin) {
					toast.error("Bạn không có quyền truy cập");
					router.push("/");
					return;
				}
			} catch {
				router.push("/auth?redirected=true");
			} finally {
				setIsLoading(false);
			}
		};

		checkAuth();
	}, [router]);

	// Fetch logs when pagination or filter triggers change
	useEffect(() => {
		if (!user) return;
		
		setIsLoadingLogs(true);
		const fetchData = async () => {
			try {
				const apiFilters: AuditLogFilters = {
					...filters,
					service: selectedService === "all" ? undefined : selectedService,
					action: searchAction || undefined,
				};
				const response = await auditService.getLogs(apiFilters);
				setLogs(response.logs);
				setTotal(response.total);
			} catch (error) {
				console.error("Failed to fetch audit logs:", error);
				toast.error("Không thể tải lịch sử hoạt động");
			} finally {
				setIsLoadingLogs(false);
			}
		};
		fetchData();
	}, [user, filters.limit, filters.offset, selectedService, searchAction]);

	const handleServiceChange = (value: string) => {
		setSelectedService(value);
		setFilters((prev) => ({ ...prev, offset: 0 }));
	};

	const handleActionChange = (value: string) => {
		setSearchAction(value);
		setFilters((prev) => ({ ...prev, offset: 0 }));
	};

	const handlePageChange = (newOffset: number) => {
		setFilters((prev) => ({
			...prev,
			offset: newOffset,
		}));
	};

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return new Intl.DateTimeFormat("vi-VN", {
			day: "2-digit",
			month: "2-digit",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		}).format(date);
	};

	const getActionColor = (action: string) => {
		const prefix = action.split("_")[0];
		return ACTION_COLORS[prefix] || "bg-gray-500";
	};

	const getActionLabel = (action: string) => {
		const labels: Record<string, string> = {
			create: "Tạo",
			update: "Cập nhật",
			delete: "Xóa",
			view: "Xem",
		};
		const prefix = action.split("_")[0];
		return labels[prefix] || action;
	};

	const getResourceName = (log: AuditLog) => {
		if (log.resource_name) return log.resource_name;
		if (log.resource_id) return log.resource_id;
		return log.resource_type || "-";
	};

	if (isLoading) {
		return (
			<div className="flex-1 overflow-auto p-6">
				<div className="max-w-6xl mx-auto w-full space-y-6">
					<Skeleton className="h-10 w-64" />
					<Skeleton className="h-48 w-full" />
					<Skeleton className="h-96 w-full" />
				</div>
			</div>
		);
	}

	if (!user) {
		return null;
	}

	const currentPage = Math.floor((filters.offset || 0) / (filters.limit || 20)) + 1;
	const totalPages = Math.ceil(total / (filters.limit || 20));

	return (
		<div className="flex-1 overflow-auto p-3">
			<div className="max-w-6xl mx-auto w-full space-y-6">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div>
						<h1 className="text-2xl font-bold flex items-center gap-3">
							<Shield className="h-7 w-7 text-primary" />
							Lịch sử hoạt động Admin
						</h1>
						<p className="text-muted-foreground text-sm mt-1">
							Theo dõi tất cả hành động của quản trị viên trong hệ thống
						</p>
					</div>
					<Button variant="outline" size="sm" asChild>
						<a href="http://localhost:16686" target="_blank" rel="noopener noreferrer">
							<Activity className="h-4 w-4 mr-2" />
							Xem Traces
						</a>
					</Button>
				</div>

				{/* Filters */}
				<Card>
					<CardContent className="p-4">
						<div className="flex flex-wrap gap-4 items-end">
							<div className="flex-1 min-w-[200px]">
								<label className="text-sm font-medium mb-2 block">Dịch vụ</label>
								<Select
									value={selectedService}
									onValueChange={handleServiceChange}
								>
									<SelectTrigger>
										<SelectValue placeholder="Chọn dịch vụ" />
									</SelectTrigger>
									<SelectContent>
										{SERVICE_OPTIONS.map((opt) => (
											<SelectItem key={opt.value} value={opt.value}>
												{opt.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<div className="flex-1 min-w-[200px]">
								<label className="text-sm font-medium mb-2 block">Loại hành động</label>
								<Input
									placeholder="Tìm kiếm hành động..."
									value={searchAction}
									onChange={(e) => handleActionChange(e.target.value)}
								/>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="icon"
									onClick={() => handlePageChange((filters.offset || 0) - (filters.limit || 20))}
									disabled={(filters.offset || 0) === 0}
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<Button
									variant="outline"
									size="icon"
									onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 20))}
									disabled={(filters.offset || 0) + (filters.limit || 20) >= total}
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stats */}
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-primary/10 rounded-lg">
									<Activity className="h-5 w-5 text-primary" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Tổng số</p>
									<p className="text-2xl font-bold">{total}</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-green-500/10 rounded-lg">
									<Activity className="h-5 w-5 text-green-500" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Tạo mới</p>
									<p className="text-2xl font-bold">
										{logs.filter((l) => l.action.startsWith("create")).length}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-blue-500/10 rounded-lg">
									<Activity className="h-5 w-5 text-blue-500" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Cập nhật</p>
									<p className="text-2xl font-bold">
										{logs.filter((l) => l.action.startsWith("update")).length}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-4">
							<div className="flex items-center gap-3">
								<div className="p-2 bg-red-500/10 rounded-lg">
									<Activity className="h-5 w-5 text-red-500" />
								</div>
								<div>
									<p className="text-sm text-muted-foreground">Xóa</p>
									<p className="text-2xl font-bold">
										{logs.filter((l) => l.action.startsWith("delete")).length}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				{/* Logs Table */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Clock className="h-5 w-5" />
							Danh sách hoạt động
						</CardTitle>
					</CardHeader>
					<CardContent>
						{isLoadingLogs ? (
							<div className="flex items-center justify-center py-12">
								<Loader2 className="h-8 w-8 animate-spin text-primary" />
							</div>
						) : logs.length === 0 ? (
							<div className="text-center py-12 text-muted-foreground">
								<Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
								<p>Không có hoạt động nào</p>
							</div>
						) : (
							<div className="space-y-3">
								{logs.map((log) => (
									<div
										key={log.id}
										className="flex items-center gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
									>
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<Badge className={`${getActionColor(log.action)} text-white`}>
													{getActionLabel(log.action)}
												</Badge>
												<span className="font-medium">{log.action}</span>
												<span className="text-muted-foreground">•</span>
												<Badge variant="outline">{log.service}</Badge>
											</div>
											<div className="flex items-center gap-4 text-sm text-muted-foreground">
												<span className="flex items-center gap-1">
													<User className="h-3 w-3" />
													{log.admin_email}
												</span>
												<span>→</span>
												<span className="font-medium text-foreground">
													{getResourceName(log)}
												</span>
											</div>
										</div>
										<div className="text-right">
											<p className="text-sm">{formatDate(log.created_at)}</p>
											{log.ip_address && (
												<p className="text-xs text-muted-foreground">
													IP: {log.ip_address}
												</p>
											)}
										</div>
									</div>
								))}
							</div>
						)}

						{/* Pagination */}
						{totalPages > 1 && (
							<div className="flex items-center justify-between mt-6 pt-4 border-t">
								<p className="text-sm text-muted-foreground">
									Trang {currentPage} / {totalPages} ({total} bản ghi)
								</p>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handlePageChange((filters.offset || 0) - (filters.limit || 20))}
										disabled={(filters.offset || 0) === 0}
									>
										<ChevronLeft className="h-4 w-4 mr-1" />
										Trước
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handlePageChange((filters.offset || 0) + (filters.limit || 20))}
										disabled={(filters.offset || 0) + (filters.limit || 20) >= total}
									>
										Sau
										<ChevronRight className="h-4 w-4 ml-1" />
									</Button>
								</div>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
