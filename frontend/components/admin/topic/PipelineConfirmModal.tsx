import { PIPELINE_RANGE_LABELS } from "./TopicData";
import type { PipelineRange } from "./TopicTypes";

type PipelineConfirmModalProps = {
  pipelineRange: PipelineRange;
  isRunningPipeline: boolean;
  onRangeChange: (value: PipelineRange) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function PipelineConfirmModal({
  pipelineRange,
  isRunningPipeline,
  onRangeChange,
  onClose,
  onConfirm,
}: PipelineConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="flex w-full max-w-135 flex-col border border-border-color bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border-color bg-slate-50/50 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-indigo-100">
              <span className="material-symbols-outlined text-2xl text-indigo-700">sync</span>
            </div>
            <h2 className="text-[18px] font-bold text-slate-900">Xác nhận Chạy Pipeline</h2>
          </div>
          <button
            type="button"
            className="text-slate-400 transition-colors hover:text-slate-600"
            onClick={onClose}
            title="Đóng"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-8">
          <p className="mb-6 text-sm leading-relaxed text-slate-600">
            Bạn có chắc chắn muốn khởi động tiến trình trích xuất chủ đề mới không? Hệ thống sẽ phân tích lại toàn bộ
            các truy vấn trong{" "}
            <select
              value={pipelineRange}
              onChange={(event) => onRangeChange(event.target.value as PipelineRange)}
              className="inline-block cursor-pointer rounded-sm border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-900 align-middle outline-none focus:border-primary"
            >
              <option value="24h">24h qua</option>
              <option value="1w">1 tuần qua</option>
              <option value="2w">2 tuần qua</option>
              <option value="1m">1 tháng qua</option>
            </select>
            .
          </p>

          <div className="flex items-start gap-3 border border-blue-100 bg-blue-50 p-4">
            <span className="material-symbols-outlined mt-0.5 text-[20px] text-blue-600">info</span>
            <span className="text-xs font-medium leading-normal text-blue-800">
              Thời gian dự kiến xử lý: 5-8 phút tùy thuộc vào tải hệ thống ({PIPELINE_RANGE_LABELS[pipelineRange]}).
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-6 border-t border-border-color bg-slate-50/30 px-8 py-5">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold uppercase tracking-widest text-slate-500 transition-colors hover:text-slate-800"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isRunningPipeline}
            className="inline-flex items-center gap-2 bg-primary px-5 py-3 text-xs font-bold uppercase tracking-widest text-white shadow-lg transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRunningPipeline ? (
              <>
                <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                Đang chạy
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                Bắt đầu ngay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
