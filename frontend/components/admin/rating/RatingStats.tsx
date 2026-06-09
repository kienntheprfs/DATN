"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { startOfWeek, startOfMonth, parseISO, format } from "date-fns";
import type { RatingFilters } from "./RatingFilterPanel";
import { ratingService } from "@/services/rating-api";

interface RatingStatsProps {
  filters: RatingFilters;
}

function safeParseDate(dateInput: any): Date | null {
  if (!dateInput) return null;
  if (dateInput instanceof Date) return dateInput;
  
  try {
    const parsed = parseISO(String(dateInput));
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {}
  
  try {
    const parsed = new Date(dateInput);
    if (!isNaN(parsed.getTime())) return parsed;
  } catch {}
  
  return null;
}

function RatingStatsSkeleton() {
  return (
    <div className="flex flex-col gap-6 mb-6">
      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-slate-200 bg-white p-5 shadow-sm rounded-sm animate-pulse">
            <div className="mb-4 flex items-center justify-between">
              <div className="h-3 w-28 bg-slate-100 rounded-sm" />
              <div className="h-5 w-5 bg-slate-100 rounded-full" />
            </div>
            <div className="h-8 w-16 bg-slate-100 rounded-sm mb-2" />
            <div className="h-3 w-32 bg-slate-100 rounded-sm" />
          </div>
        ))}
      </div>
      
      {/* Charts Grid Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 border border-slate-200 bg-white p-5 shadow-sm rounded-sm h-72 animate-pulse">
          <div className="h-4 w-48 bg-slate-100 rounded-sm mb-6" />
          <div className="h-full w-full bg-slate-50 rounded-sm" />
        </div>
        <div className="lg:col-span-7 border border-slate-200 bg-white p-5 shadow-sm rounded-sm h-72 animate-pulse">
          <div className="h-4 w-48 bg-slate-100 rounded-sm mb-6" />
          <div className="h-full w-full bg-slate-50 rounded-sm" />
        </div>
      </div>
    </div>
  );
}

export function RatingStats({ filters }: RatingStatsProps) {
  const [grouping, setGrouping] = useState<"day" | "week" | "month">("day");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-rating-stats", filters],
    queryFn: () =>
      ratingService.getAdminRatingStats({
        search: filters.search.trim() || undefined,
        from_date: filters.fromDate || undefined,
        to_date: filters.toDate || undefined,
      }),
  });

  // Aggregated rating trend data based on selected interval
  const groupedChartData = useMemo(() => {
    if (!data?.daily_stats) return [];

    if (grouping === "day") {
      return data.daily_stats.map((item) => {
        let label = item.date;
        const d = safeParseDate(item.date);
        if (d) {
          label = format(d, "dd/MM");
        }
        return {
          ...item,
          name: label,
          formattedDate: item.date,
        };
      });
    }

    const groups: {
      [key: string]: { like_count: number; dislike_count: number; formattedLabel: string };
    } = {};

    data.daily_stats.forEach((item) => {
      const d = safeParseDate(item.date);
      if (!d) return;

      let groupKey = "";
      let formattedLabel = "";

      if (grouping === "week") {
        const start = startOfWeek(d, { weekStartsOn: 1 }); // Monday
        groupKey = format(start, "yyyy-MM-dd");
        formattedLabel = `Tuần từ ${format(start, "dd/MM/yyyy")}`;
      } else {
        const start = startOfMonth(d);
        groupKey = format(start, "yyyy-MM");
        formattedLabel = `Tháng ${format(start, "MM/yyyy")}`;
      }

      if (!groups[groupKey]) {
        groups[groupKey] = {
          like_count: 0,
          dislike_count: 0,
          formattedLabel,
        };
      }

      groups[groupKey].like_count += item.like_count;
      groups[groupKey].dislike_count += item.dislike_count;
    });

    return Object.keys(groups)
      .sort()
      .map((key) => {
        let name = key;
        if (grouping === "week") {
          const d = safeParseDate(key);
          if (d) {
            name = `T.${format(d, "dd/MM")}`;
          }
        } else {
          const parts = key.split("-");
          name = `${parts[1]}/${parts[0]}`;
        }

        return {
          name,
          like_count: groups[key].like_count,
          dislike_count: groups[key].dislike_count,
          formattedDate: groups[key].formattedLabel,
        };
      });
  }, [data, grouping]);

  // Dislike reasons sorted descending, filtering out zero-counts for cleaner viz
  const dislikeReasonsData = useMemo(() => {
    if (!data?.dislike_reasons) return [];
    return [...data.dislike_reasons]
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (isLoading) {
    return <RatingStatsSkeleton />;
  }

  if (isError) {
    return (
      <div className="mb-6 p-4 rounded-sm border border-red-200 bg-red-50 text-sm text-red-700 flex items-center justify-between">
        <span>Không thể tải thống kê đánh giá. Vui lòng thử lại.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="font-semibold underline decoration-red-400 underline-offset-2 hover:text-red-900"
        >
          Tải lại
        </button>
      </div>
    );
  }

  const total = data?.total ?? 0;
  const likeCount = data?.like_count ?? 0;
  const dislikeCount = data?.dislike_count ?? 0;
  const likePercentage = data?.like_percentage ?? 0;

  const intervals: { value: "day" | "week" | "month"; label: string }[] = [
    { value: "day", label: "Ngày" },
    { value: "week", label: "Tuần" },
    { value: "month", label: "Tháng" },
  ];

  return (
    <div className="flex flex-col gap-6 mb-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        {/* Card 1: Total Feedbacks */}
        <div className="border border-slate-200 bg-white p-5 shadow-sm rounded-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Tổng số đánh giá
            </span>
            <span className="material-symbols-outlined text-[20px] text-blue-500">
              rate_review
            </span>
          </div>
          <div className="flex items-end gap-3">
            <span className="font-mono text-3xl font-extrabold text-slate-800">
              {total}
            </span>
            <span className="mb-1 text-xs text-slate-500">
              phản hồi từ người dùng
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-400 italic">
            Tổng hợp tất cả lượt thích và không thích được ghi nhận.
          </p>
        </div>

        {/* Card 2: Likes */}
        <div className="border border-slate-200 bg-white p-5 shadow-sm rounded-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Hài lòng
            </span>
            <span className="material-symbols-outlined text-[20px] text-green-500 fill-1">
              thumb_up
            </span>
          </div>
          <div className="flex items-end gap-3">
            <span className="font-mono text-3xl font-extrabold text-green-600">
              {likeCount}
            </span>
            <span className="mb-1 text-xs font-bold text-green-600">
              {likePercentage}% tỉ lệ hài lòng
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-green-500 transition-all duration-500"
              style={{ width: `${likePercentage}%` }}
            />
          </div>
        </div>

        {/* Card 3: Dislikes */}
        <div className="border border-slate-200 bg-white p-5 shadow-sm rounded-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Không hài lòng
            </span>
            <span className="material-symbols-outlined text-[20px] text-red-500 fill-1">
              thumb_down
            </span>
          </div>
          <div className="flex items-end gap-3">
            <span className="font-mono text-3xl font-extrabold text-red-600">
              {dislikeCount}
            </span>
            <span className="mb-1 text-xs text-red-500 font-medium">
              cần kiểm tra lại phản hồi
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-red-500 transition-all duration-500"
              style={{ width: `${total > 0 ? (dislikeCount / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Chart: Dislike Reasons */}
        <div className="lg:col-span-5 border border-slate-200 bg-white p-5 shadow-sm rounded-sm">
          <h3 className="text-xs font-bold text-slate-700 mb-6 font-heading uppercase tracking-wider">
            Phân tích nguyên nhân Dislike
          </h3>
          
          {dislikeCount === 0 || dislikeReasonsData.length === 0 ? (
            <div className="flex h-56 w-full items-center justify-center rounded-sm bg-slate-50 text-sm text-slate-400 italic">
              Không có dữ liệu đánh giá không hài lòng
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dislikeReasonsData}
                  layout="vertical"
                  margin={{ top: 5, right: 15, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="reason"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                    width={110}
                  />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="rounded-sm border border-slate-200 bg-white p-3 shadow-xl">
                            <p className="text-xs font-bold text-slate-800 mb-1">
                              {item.reason}
                            </p>
                            <p className="text-xs font-semibold text-red-600">
                              Số lượng: <span className="font-bold font-mono">{item.count}</span>
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="#ef4444"
                    radius={[0, 4, 4, 0]}
                    barSize={16}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Chart: Rating Trend */}
        <div className="lg:col-span-7 border border-slate-200 bg-white p-5 shadow-sm rounded-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="text-xs font-bold text-slate-700 font-heading uppercase tracking-wider">
              Xu hướng đánh giá theo thời gian
            </h3>
            
            {/* Interval Toggle Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-sm self-start sm:self-auto">
              {intervals.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setGrouping(item.value)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-sm transition-all cursor-pointer ${
                    grouping === item.value
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          
          {groupedChartData.length === 0 ? (
            <div className="flex h-56 w-full items-center justify-center rounded-sm bg-slate-50 text-sm text-slate-400 italic">
              Không có dữ liệu đánh giá trong khoảng thời gian này
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={groupedChartData}
                  margin={{ top: 5, right: 10, left: -25, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 11, fontWeight: 600 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: "#f8fafc" }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        return (
                          <div className="rounded-sm border border-slate-200 bg-white p-3 shadow-xl">
                            <p className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                              {item.formattedDate}
                            </p>
                            <div className="flex flex-col gap-1">
                              <p className="text-xs font-semibold text-green-600 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                Hài lòng: <span className="font-bold font-mono">{item.like_count}</span>
                              </p>
                              <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-red-500" />
                                Không hài lòng: <span className="font-bold font-mono">{item.dislike_count}</span>
                              </p>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, fontWeight: 600, paddingBottom: 10 }}
                  />
                  <Bar
                    dataKey="like_count"
                    stackId="a"
                    fill="#22c55e"
                    name="Hài lòng"
                    barSize={20}
                  />
                  <Bar
                    dataKey="dislike_count"
                    stackId="a"
                    fill="#ef4444"
                    name="Không hài lòng"
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
