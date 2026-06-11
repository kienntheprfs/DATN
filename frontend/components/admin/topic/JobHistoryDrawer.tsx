"use client";

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { topicService } from "@/services/topic-api";
import { toast } from "sonner";

interface JobHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  topicType: string;
  onSelectJobResult: (resultId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Chờ xử lý",
  running: "Đang chạy",
  succeeded: "Thành công",
  failed: "Thất bại",
};

const STAGE_LABELS: Record<string, string> = {
  pending: "Đang chờ",
  loading_input: "Tải dữ liệu đầu vào",
  modeling: "Mô hình hóa chủ đề",
  exporting_file: "Xuất tệp kết quả",
  exporting_db: "Ghi nhận cơ sở dữ liệu",
  completed: "Hoàn tất",
};

const TIME_RANGE_LABELS: Record<string, string> = {
  "24h": "24 giờ qua",
  "7d": "7 ngày qua",
  "14d": "14 ngày qua",
  "30d": "30 ngày qua",
};

export function JobHistoryDrawer({
  isOpen,
  onClose,
  topicType,
  onSelectJobResult,
}: JobHistoryDrawerProps) {
  const queryClient = useQueryClient();
  const [loadingJobResultsId, setLoadingJobResultsId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"new_to_old" | "old_to_new">("new_to_old");

  // Fetch job history and poll if any job is pending or running
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["topics", "jobsList"],
    queryFn: () => topicService.listJobs(),
    refetchInterval: (query) => {
      const list = query.state.data ?? [];
      const hasActive = list.some(
        (job) => job.status === "pending" || job.status === "running"
      );
      return hasActive ? 3000 : false;
    },
    enabled: isOpen,
  });

  // Cancel job mutation
  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => topicService.cancelJob(jobId),
    onSuccess: () => {
      toast.success("Đã yêu cầu hủy chạy pipeline!");
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Đã xảy ra lỗi khi hủy chạy pipeline.";
      toast.error("Hủy chạy pipeline thất bại", { description: detail });
    },
  });

  // Delete job mutation
  const deleteMutation = useMutation({
    mutationFn: (jobId: string) => topicService.deleteJob(jobId),
    onSuccess: () => {
      toast.success("Đã xóa bản ghi chạy pipeline thành công!");
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? "Đã xảy ra lỗi khi xóa bản ghi.";
      toast.error("Xóa bản ghi thất bại", { description: detail });
    },
  });

  // Find the absolute latest job ID by date (always the newest run)
  const latestJobId = useMemo(() => {
    if (jobs.length === 0) return null;
    return [...jobs].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0].id;
  }, [jobs]);

  // Sort jobs based on user selection
  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      const timeA = new Date(a.created_at).getTime();
      const timeB = new Date(b.created_at).getTime();
      return sortOrder === "new_to_old" ? timeB - timeA : timeA - timeB;
    });
  }, [jobs, sortOrder]);

  const handleSelectJob = async (jobId: string) => {
    setLoadingJobResultsId(jobId);
    try {
      const resultIds = await topicService.getJobResults(jobId);
      const targetResultId = resultIds[topicType];
      if (targetResultId) {
        onSelectJobResult(targetResultId);
      } else {
        toast.error("Không tìm thấy kết quả phân loại cho chủ đề này.");
      }
    } catch (e) {
      toast.error("Không thể tải kết quả cho lần chạy này.");
    } finally {
      setLoadingJobResultsId(null);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "N/A";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("vi-VN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const getDuration = (startStr: string, endStr: string | null) => {
    if (!endStr) return "N/A";
    try {
      const start = new Date(startStr).getTime();
      const end = new Date(endStr).getTime();
      const diffMs = end - start;
      if (isNaN(diffMs) || diffMs < 0) return "N/A";
      const seconds = Math.floor(diffMs / 1000);
      if (seconds < 60) return `${seconds} giây`;
      const minutes = Math.floor(seconds / 60);
      const remSeconds = seconds % 60;
      return `${minutes} phút ${remSeconds} giây`;
    } catch {
      return "N/A";
    }
  };

  return (
    <div
      className={`topic-drawer-container absolute right-0 top-0 bottom-0 z-40 flex flex-col border-l border-border-color bg-white shadow-2xl transition-all duration-300 ease-in-out font-sans ${
        isOpen ? "translate-x-0 w-full sm:w-[480px]" : "translate-x-full pointer-events-none w-0"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-color bg-slate-50 px-6 py-4">
        <div>
          <h1 className="font-heading text-lg font-bold text-slate-800">
            Lịch sử Pipeline Job
          </h1>
          <div className="text-sm font-semibold text-slate-500 mt-1 font-sans">
            Danh sách tất cả các lần chạy phân loại chủ đề
          </div>
        </div>
        <div className="flex items-center gap-2">
          {jobs.length > 1 && (
            <button
              onClick={() => setSortOrder(prev => prev === "new_to_old" ? "old_to_new" : "new_to_old")}
              className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 hover:text-primary transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold uppercase border border-slate-200 bg-white"
              title="Đổi thứ tự hiển thị"
            >
              <span className="material-symbols-outlined text-[16px]">
                {sortOrder === "new_to_old" ? "arrow_downward" : "arrow_upward"}
              </span>
              {sortOrder === "new_to_old" ? "Mới nhất" : "Cũ nhất"}
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
        {isLoading && jobs.length === 0 ? (
          <div className="space-y-3 animate-pulse">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-slate-100 rounded-sm border border-slate-200" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-sm border border-dashed border-slate-200 p-8 text-center bg-slate-50/50">
            <span className="material-symbols-outlined text-4xl text-slate-300">history_toggle_off</span>
            <p className="text-base font-semibold text-slate-800 mt-2">Chưa có lịch sử chạy pipeline.</p>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              Khởi chạy "Phân loại chủ đề" để tạo lần chạy mới.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {sortedJobs.map((job) => {
              const isRunning = job.status === "running" || job.status === "pending";
              const isSucceeded = job.status === "succeeded";
              const isFailed = job.status === "failed";
              
              // Status Styling
              let statusBg = "bg-slate-100 text-slate-700 border-slate-200";
              let statusIcon = "hourglass_empty";
              if (job.status === "running") {
                statusBg = "bg-blue-50 text-blue-700 border-blue-200";
                statusIcon = "sync";
              } else if (isSucceeded) {
                statusBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                statusIcon = "check_circle";
              } else if (isFailed) {
                statusBg = "bg-rose-50 text-rose-700 border-rose-200";
                statusIcon = "error";
              }

              return (
                <div
                  key={job.id}
                  className={`rounded-sm border p-4 bg-white shadow-sm transition-all hover:shadow-md border-slate-200`}
                >
                  {/* Job Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-mono text-slate-400 truncate max-w-[200px]" title={job.id}>
                        ID: {job.id}
                      </p>
                      <p className="text-sm font-bold text-slate-800 mt-0.5">
                        Quét dữ liệu: {TIME_RANGE_LABELS[job.time_range] || job.time_range}
                      </p>
                      {job.id === latestJobId && (
                        <div className="mt-1.5">
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-500 text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[10px]">star</span>
                            Mới nhất
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${statusBg}`}>
                        <span className={`material-symbols-outlined text-xs ${job.status === "running" ? "animate-spin" : ""}`}>
                          {statusIcon}
                        </span>
                        {STATUS_LABELS[job.status] || job.status}
                      </span>
                    </div>
                  </div>

                  {/* Job Details */}
                  <div className="space-y-1 text-xs font-semibold text-slate-600 border-t border-slate-100 pt-2.5 font-sans">
                    <div className="flex justify-between">
                      <span>Khởi chạy:</span>
                      <span className="text-slate-800">{formatDateTime(job.created_at)}</span>
                    </div>
                    {job.completed_at && (
                      <div className="flex justify-between">
                        <span>Hoàn thành:</span>
                        <span className="text-slate-800">{formatDateTime(job.completed_at)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>Thời gian chạy:</span>
                      <span className="text-slate-800">
                        {isRunning ? "Đang chạy..." : getDuration(job.created_at, job.completed_at)}
                      </span>
                    </div>
                    {!isSucceeded && !isFailed && job.stage && (
                      <div className="flex justify-between">
                        <span>Giai đoạn:</span>
                        <span className="text-blue-600 font-bold">
                          {STAGE_LABELS[job.stage] || job.stage}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Progress Bar for Active Jobs */}
                  {isRunning && (
                    <div className="mt-3.5 space-y-1">
                      <div className="flex justify-between text-[11px] font-bold text-blue-700 uppercase font-sans">
                        <span>Đang xử lý</span>
                        <span>{job.progress}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${job.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Message/Error Warning block */}
                  {job.error_detail && (
                    <div className="mt-3 p-2 rounded bg-rose-50 border border-rose-100 text-rose-700 text-xs font-medium break-words font-sans">
                      <p className="font-bold flex items-center gap-1 mb-0.5">
                        <span className="material-symbols-outlined text-sm">warning</span>
                        Chi tiết lỗi:
                      </p>
                      {job.error_detail}
                    </div>
                  )}

                  {job.message && !job.error_detail && (
                    <div className="mt-3 p-2 rounded bg-slate-50 border border-slate-100 text-slate-600 text-xs font-medium italic break-words font-sans">
                      {job.message}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-4 flex gap-2 justify-end border-t border-slate-100 pt-3">
                    {isRunning ? (
                      <button
                        type="button"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(job.id)}
                        className="flex items-center gap-1 px-3 py-1.5 border border-red-300 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold uppercase rounded-sm transition-all cursor-pointer disabled:opacity-50 font-sans"
                      >
                        <span className="material-symbols-outlined text-sm">cancel</span>
                        Hủy chạy
                      </button>
                    ) : (
                      <>
                        {isSucceeded && (
                          <button
                            type="button"
                            disabled={loadingJobResultsId !== null}
                            onClick={() => handleSelectJob(job.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-dark border border-primary text-white text-xs font-bold uppercase rounded-sm transition-all cursor-pointer disabled:opacity-50 font-sans mr-auto"
                          >
                            {loadingJobResultsId === job.id ? (
                              <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                            ) : (
                              <span className="material-symbols-outlined text-sm">visibility</span>
                            )}
                            Xem kết quả
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={deleteMutation.isPending}
                          onClick={() => deleteMutation.mutate(job.id)}
                          className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 hover:border-red-300 hover:text-red-500 text-slate-500 text-xs font-bold uppercase rounded-sm transition-all cursor-pointer disabled:opacity-50 font-sans"
                        >
                          <span className="material-symbols-outlined text-sm">delete</span>
                          Xóa bản ghi
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-border-color bg-slate-50 px-6 py-4 flex shrink-0">
        <button
          onClick={onClose}
          className="w-full rounded-sm border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}
