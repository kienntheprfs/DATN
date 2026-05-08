"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PipelineConfirmModal } from "@/components/admin/topic/PipelineConfirmModal";
import { TopicDetailPanel } from "@/components/admin/topic/TopicDetailPanel";
import { TopicListPanel } from "@/components/admin/topic/TopicListPanel";
import type { PipelineRange, TrendView } from "@/components/admin/topic/TopicTypes";
import topicService from "@/services/topic-api";
import type { TopicListItem } from "@/services/topic-api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PIPELINE_RANGE_TO_TIME_RANGE: Record<PipelineRange, string> = {
  "24h": "24h",
  "1w": "7d",
  "2w": "14d",
  "1m": "30d",
};

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function TopicPage() {
  const queryClient = useQueryClient();

  // --- UI state ---
  const [selectedKey, setSelectedKey] = useState<string | null>(null); // "topicType:topicId"
  const [trendView, setTrendView] = useState<TrendView>("day");
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [pipelineRange, setPipelineRange] = useState<PipelineRange>("1w");

  // ---------------------------------------------------------------------------
  // Data: fetch BOTH topic types in parallel, merge into one list
  // ---------------------------------------------------------------------------

  const {
    data: missingList,
    isLoading: isLoadingMissing,
    isError: isErrorMissing,
    refetch: refetchMissing,
  } = useQuery({
    queryKey: ["topics", "list", "missing_knowledge"],
    queryFn: () => topicService.getTopicList("missing_knowledge"),
    select: (data) => data.items,
  });

  const {
    data: popularList,
    isLoading: isLoadingPopular,
    isError: isErrorPopular,
    refetch: refetchPopular,
  } = useQuery({
    queryKey: ["topics", "list", "popular_questions"],
    queryFn: () => topicService.getTopicList("popular_questions"),
    select: (data) => data.items,
  });

  // Merge: missing_knowledge first, then popular_questions
  const allTopics = useMemo<TopicListItem[]>(
    () => [...(missingList ?? []), ...(popularList ?? [])],
    [missingList, popularList]
  );

  const isLoadingTopics = isLoadingMissing || isLoadingPopular;
  const isTopicsError = isErrorMissing && isErrorPopular; // error only if BOTH fail

  const refetchTopics = () => {
    refetchMissing();
    refetchPopular();
  };

  // Auto-select first topic on initial load
  useEffect(() => {
    if (allTopics.length > 0 && selectedKey === null) {
      const first = allTopics[0];
      setSelectedKey(`${first.topic_type}:${first.topic_id}`);
    }
  }, [allTopics, selectedKey]);

  const selectedTopic =
    allTopics.find((t) => `${t.topic_type}:${t.topic_id}` === selectedKey) ??
    allTopics[0] ??
    null;

  // The topicType is derived from whichever topic is selected
  const topicType = selectedTopic?.topic_type ?? "missing_knowledge";

  // Numeric id for passing down (detail panel uses it for API calls)
  const selectedTopicId = selectedTopic?.topic_id ?? null;

  // ---------------------------------------------------------------------------
  // Data: current pipeline job (polls every 3s while active)
  // ---------------------------------------------------------------------------

  const { data: currentJob } = useQuery({
    queryKey: ["topics", "currentJob"],
    queryFn: () => topicService.getCurrentJob(),
    refetchInterval: (query) => {
      const job = query.state.data;
      if (!job) return false;
      return job.status === "pending" || job.status === "running" ? 3000 : false;
    },
  });

  // ---------------------------------------------------------------------------
  // Mutation: trigger pipeline (runs both topic types in one job)
  // ---------------------------------------------------------------------------

  const triggerPipelineMutation = useMutation({
    mutationFn: () =>
      topicService.triggerJob({
        time_range: (PIPELINE_RANGE_TO_TIME_RANGE[pipelineRange] ?? "7d") as any,
      }),
    onSuccess: () => {
      toast.success("Pipeline đã được khởi động!", {
        description: "Hệ thống sẽ phân tích cả Tri thức thiếu và Câu hỏi phổ biến.",
      });
      setShowPipelineModal(false);
      queryClient.invalidateQueries({ queryKey: ["topics"] });
    },
    onError: (err: any) => {
      const detail =
        err?.response?.data?.detail ?? "Đã xảy ra lỗi khi khởi động pipeline.";
      toast.error("Khởi động pipeline thất bại", { description: detail });
    },
  });

  // ---------------------------------------------------------------------------
  // Mutation: pin / knowledge update
  // ---------------------------------------------------------------------------

  const pinMutation = useMutation({
    mutationFn: ({
      resultId,
      topicId,
      pinned,
      knowledgeUpdated,
    }: {
      resultId: string;
      topicId: number;
      pinned?: boolean;
      knowledgeUpdated?: boolean;
    }) =>
      topicService.updatePin(resultId, topicId, {
        pinned,
        knowledge_updated: knowledgeUpdated,
      }),
    onSuccess: (_, variables) => {
      if (variables.pinned !== undefined) {
        toast.success(variables.pinned ? "Đã ghim bài lên trang chủ" : "Đã bỏ ghim");
      }
      if (variables.knowledgeUpdated !== undefined) {
        toast.success(
          variables.knowledgeUpdated
            ? "Đã đánh dấu cập nhật tri thức"
            : "Đã bỏ đánh dấu tri thức"
        );
      }
      // Refresh both lists so pin states update
      queryClient.invalidateQueries({ queryKey: ["topics", "list"] });
    },
    onError: () => {
      toast.error("Cập nhật thất bại. Vui lòng thử lại.");
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRunPipeline = () => {
    triggerPipelineMutation.mutate();
  };

  const handlePinTopic = () => {
    if (!selectedTopic) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      pinned: !selectedTopic.pinned,
    });
  };

  const handleUpdateKnowledge = () => {
    if (!selectedTopic) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      knowledgeUpdated: !selectedTopic.knowledge_updated,
    });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="-m-4 flex h-[calc(100vh-40px)] flex-col overflow-hidden bg-background-light md:-m-6">
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[350px_minmax(0,1fr)] ${
          showPipelineModal ? "select-none blur-xs" : ""
        }`}
      >
        {/* Left: topic list panel — filters by topic_type client-side */}
        <TopicListPanel
          isLoading={isLoadingTopics}
          isError={isTopicsError}
          topics={allTopics}
          selectedTopicKey={selectedKey}
          currentJob={currentJob ?? null}
          onTopicSelect={(key) => setSelectedKey(key)}
          onOpenPipelineModal={() => setShowPipelineModal(true)}
          onRetry={refetchTopics}
        />

        {/* Right: detail panel — topicType derived from selected topic */}
        <TopicDetailPanel
          isLoading={isLoadingTopics}
          isError={isTopicsError}
          selectedTopic={selectedTopic}
          topicType={topicType}
          trendView={trendView}
          isPinning={pinMutation.isPending && pinMutation.variables?.pinned !== undefined}
          isUpdatingKnowledge={
            pinMutation.isPending && pinMutation.variables?.knowledgeUpdated !== undefined
          }
          onTrendViewChange={setTrendView}
          onPinTopic={handlePinTopic}
          onUpdateKnowledge={handleUpdateKnowledge}
        />
      </div>

      {showPipelineModal && (
        <PipelineConfirmModal
          pipelineRange={pipelineRange}
          isRunningPipeline={triggerPipelineMutation.isPending}
          onRangeChange={setPipelineRange}
          onClose={() => {
            if (!triggerPipelineMutation.isPending) {
              setShowPipelineModal(false);
            }
          }}
          onConfirm={handleRunPipeline}
        />
      )}
    </div>
  );
}
