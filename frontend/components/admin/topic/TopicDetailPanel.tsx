import { TREND_BARS, statusBadgeLabel } from "./TopicData";
import type { TopicItem, TrendView } from "./TopicTypes";

type TopicDetailPanelProps = {
  isLoading: boolean;
  selectedTopic: TopicItem;
  trendView: TrendView;
  sortedQuestions: TopicItem["rawQuestions"];
  isPinning: boolean;
  isUpdatingKnowledge: boolean;
  onTrendViewChange: (value: TrendView) => void;
  onToggleSortDirection: () => void;
  onPinTopic: () => void;
  onUpdateKnowledge: () => void;
};

function TopicDetailLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <div className="mb-4 flex gap-2">
            <div className="h-4 w-32 rounded bg-slate-200" />
            <div className="h-4 w-24 rounded bg-slate-200" />
          </div>
          <div className="h-8 w-96 rounded bg-slate-300" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-10 rounded bg-slate-200" />
          <div className="h-10 w-10 rounded bg-slate-200" />
          <div className="h-10 w-10 rounded bg-slate-200" />
        </div>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="h-24 rounded bg-slate-200" />
        <div className="h-24 rounded bg-slate-200" />
        <div className="h-24 rounded bg-slate-200" />
      </div>
      <div className="mb-8 rounded-sm border border-border-color bg-white">
        <div className="border-b border-border-color p-6">
          <div className="mb-6 h-4 w-1/4 rounded bg-slate-200" />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div>
              <div className="mb-4 h-3 w-1/3 rounded bg-slate-100" />
              <div className="mb-8 flex flex-wrap gap-2">
                <div className="h-6 w-16 rounded bg-slate-100" />
                <div className="h-6 w-20 rounded bg-slate-100" />
                <div className="h-6 w-14 rounded bg-slate-100" />
              </div>
              <div className="mb-4 h-3 w-1/2 rounded bg-slate-100" />
              <div className="space-y-2">
                <div className="h-8 w-full rounded border border-slate-100 bg-slate-50" />
                <div className="h-8 w-full rounded border border-slate-100 bg-slate-50" />
              </div>
            </div>
            <div>
              <div className="mb-4 h-3 w-1/3 rounded bg-slate-100" />
              <div className="h-32 w-full rounded border border-slate-100 bg-slate-50" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TopicDetailPanel({
  isLoading,
  selectedTopic,
  trendView,
  sortedQuestions,
  isPinning,
  isUpdatingKnowledge,
  onTrendViewChange,
  onToggleSortDirection,
  onPinTopic,
  onUpdateKnowledge,
}: TopicDetailPanelProps) {
  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden">
      <div className="custom-scrollbar flex-1 overflow-y-auto p-4 pb-28 md:p-8">
        <div className="mx-auto w-full max-w-4xl">
          {isLoading ? (
            <TopicDetailLoading />
          ) : (
            <>
              <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-end">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="border border-border-color bg-slate-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
                      ID: {selectedTopic.id}
                    </span>
                    {selectedTopic.knowledgeUpdated && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-pink-600">
                        <span className="material-symbols-outlined text-[10px]">history_edu</span>
                        Đã cập nhật tri thức
                      </span>
                    )}
                    {selectedTopic.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-600">
                        <span className="material-symbols-outlined text-[10px]">push_pin</span>
                        Đã ghim bài lên trang chủ
                      </span>
                    )}
                  </div>
                  <h1 className="text-2xl font-bold text-slate-900">{selectedTopic.title}</h1>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white" title="Chia sẻ">
                    <span className="material-symbols-outlined text-xl">share</span>
                  </button>
                  <button type="button" className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white" title="Tải xuống">
                    <span className="material-symbols-outlined text-xl">download</span>
                  </button>
                  <button type="button" className="rounded-sm border border-border-color p-2 text-slate-500 transition-colors hover:bg-white" title="Thêm hành động">
                    <span className="material-symbols-outlined text-xl">more_horiz</span>
                  </button>
                </div>
              </div>

              <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-sm border border-white/10 bg-primary p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-white/60">Thực thể nổi bật</div>
                  <div className="text-lg font-bold leading-tight text-white">{selectedTopic.featuredEntity}</div>
                </div>
                <div className="rounded-sm border border-border-color bg-white p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Độ tin cậy trung bình</div>
                  <div className="font-mono text-[32px] font-bold leading-none text-slate-900">{selectedTopic.confidence}%</div>
                  <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full bg-primary" style={{ width: `${selectedTopic.confidence}%` }} />
                  </div>
                </div>
                <div className="rounded-sm border border-border-color bg-white p-5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Đồng bộ cuối</div>
                  <div className="font-mono text-lg font-bold text-slate-900">{selectedTopic.syncAgo}</div>
                  <div className="mt-2 flex items-center text-[10px] font-bold uppercase tracking-tight text-emerald-600">
                    <span className="material-symbols-outlined mr-1 text-sm">check_circle</span>
                    {statusBadgeLabel[selectedTopic.status]}
                  </div>
                </div>
              </div>

              <div className="mb-8 rounded-sm border border-border-color bg-white">
                <div className="flex flex-col items-start justify-between gap-3 border-b border-border-color bg-slate-50/50 px-6 py-3 md:flex-row md:items-center">
                  <h3 className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-700">Báo cáo Phân tích Chi tiết</h3>
                  <div className="inline-flex rounded-sm border border-border-color bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => onTrendViewChange("day")}
                      className={`px-3 py-1 text-[10px] font-bold ${trendView === "day" ? "rounded-sm bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >
                      Ngày
                    </button>
                    <button
                      type="button"
                      onClick={() => onTrendViewChange("week")}
                      className={`px-3 py-1 text-[10px] font-bold ${trendView === "week" ? "rounded-sm bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >
                      Tuần
                    </button>
                    <button
                      type="button"
                      onClick={() => onTrendViewChange("month")}
                      className={`px-3 py-1 text-[10px] font-bold ${trendView === "month" ? "rounded-sm bg-primary text-white" : "text-slate-500 hover:bg-slate-50"}`}
                    >
                      Tháng
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                    <div>
                      <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">Từ khóa chính</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTopic.tags.map((tag) => (
                          <span key={tag} className="rounded-sm border border-border-color bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600" title={`Từ khóa: ${tag}`}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">Nguồn dữ liệu trích xuất</h4>
                        <div className="space-y-2">
                          {selectedTopic.sources.map((source) => (
                            <div key={source.label} className="flex items-center justify-between rounded-sm border border-border-color bg-slate-50 p-2 text-xs">
                              <span className="text-slate-700">{source.label}</span>
                              <span className="font-mono text-slate-500">{source.percent}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">Xu hướng truy vấn</h4>
                      <div className="flex h-32 w-full items-end justify-between gap-1 rounded-sm border border-border-color bg-slate-50 p-4">
                        {TREND_BARS.map((height, index) => (
                          <div
                            key={`${height}-${index}`}
                            className={`w-full rounded-t-sm ${index === 3 ? "bg-primary" : index % 2 === 0 ? "bg-blue-200" : "bg-blue-300"}`}
                            style={{ height: `${height}%` }}
                          />
                        ))}
                      </div>
                      <div className="mt-4 flex justify-between font-mono text-[10px] text-slate-400">
                        <span>MON</span>
                        <span>TUE</span>
                        <span>WED</span>
                        <span>THU</span>
                        <span>FRI</span>
                        <span>SAT</span>
                        <span>SUN</span>
                      </div>

                      <div className="mt-8">
                        <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">Phân tích sắc thái (Sentiment)</h4>
                        <div className="flex flex-col gap-4 sm:flex-row">
                          <div className="flex-1">
                            <div className="mb-1 flex justify-between text-[10px] font-bold">
                              <span>TÍCH CỰC</span>
                              <span>{selectedTopic.sentimentPositive}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-emerald-500" style={{ width: `${selectedTopic.sentimentPositive}%` }} />
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="mb-1 flex justify-between text-[10px] font-bold">
                              <span>PHỨC TẠP</span>
                              <span>{selectedTopic.sentimentComplex}%</span>
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full bg-orange-400" style={{ width: `${selectedTopic.sentimentComplex}%` }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border-t border-border-color bg-slate-50/30 p-6">
                  <h4 className="mb-4 font-heading text-[11px] font-bold uppercase tracking-widest text-slate-400">Ghi chú kiểm duyệt</h4>
                  <p className="border-l-2 border-slate-200 pl-4 text-xs italic leading-relaxed text-slate-600">
                    &quot;{selectedTopic.moderationNote}&quot;
                    <span className="mt-2 block text-[10px] font-bold text-slate-400">- Đã cập nhật bởi Admin vào 10/10/2023</span>
                  </p>
                </div>
              </div>

              <div className="mb-8 overflow-hidden rounded-sm border border-border-color bg-white">
                <div className="flex items-center justify-between border-b border-border-color bg-slate-50/50 px-6 py-3">
                  <h3 className="font-heading text-[12px] font-bold uppercase tracking-wider text-slate-700">Danh sách câu hỏi thô</h3>
                  <span className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{sortedQuestions.length} entries today</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary">Câu hỏi</th>
                        <th className="border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary">Người dùng</th>
                        <th className="flex cursor-pointer items-center gap-1 border-b border-border-color px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-primary transition-colors hover:bg-blue-50" onClick={onToggleSortDirection} title="Đổi thứ tự thời gian">
                          Thời gian
                          <span className="material-symbols-outlined text-[14px]">sort</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="text-xs text-slate-700">
                      {sortedQuestions.map((question) => (
                        <tr key={`${question.user}-${question.timestamp}`} className="border-b border-border-color transition-colors hover:bg-slate-50 last:border-b-0">
                          <td className="px-6 py-3 leading-relaxed">{question.question}</td>
                          <td className="px-6 py-3 font-medium">{question.user}</td>
                          <td className="px-6 py-3 font-mono text-[10px] text-slate-500">{question.timestamp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-center border-t border-border-color bg-slate-50/50 p-3">
                  <button type="button" className="text-[10px] font-bold uppercase tracking-widest text-primary hover:underline">
                    Xem thêm 20 câu hỏi khác
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-30 flex justify-end gap-3 border-t border-border-color bg-white/80 p-4 backdrop-blur-md">
        <button
          type="button"
          onClick={onPinTopic}
          disabled={isPinning || isLoading}
          className="inline-flex items-center gap-2 rounded-sm border-2 border-primary bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-primary shadow-sm transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="Ghim bài viết lên trang chủ"
        >
          {isPinning && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
          Thêm bài ghim trang chủ
        </button>
        <button
          type="button"
          onClick={onUpdateKnowledge}
          disabled={isUpdatingKnowledge || isLoading}
          className="inline-flex items-center gap-2 rounded-sm bg-primary px-6 py-2.5 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          title="Cập nhật tri thức"
        >
          {isUpdatingKnowledge && <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>}
          Cập nhật tri thức
        </button>
      </div>
    </section>
  );
}
