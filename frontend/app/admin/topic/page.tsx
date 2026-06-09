"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

import { PipelineConfirmModal } from "@/components/admin/topic/PipelineConfirmModal";
import { TopicDetailPanel } from "@/components/admin/topic/TopicDetailPanel";
import { TopicListPanel } from "@/components/admin/topic/TopicListPanel";
import { KnowledgeDrawer } from "@/components/admin/topic/KnowledgeDrawer";
import { PinnedPostDrawer } from "@/components/admin/topic/PinnedPostDrawer";
import type { PipelineRange, TrendView } from "@/components/admin/topic/TopicTypes";
import topicService from "@/services/topic-api";
import type { TopicListItem } from "@/services/topic-api";
import type { KnowledgeAdminDocumentItem } from "@/services/knowledge-api";

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

export function TopicPageContent() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // --- UI state ---
  const [selectedKey, setSelectedKey] = useState<string | null>(null); // "topicType:topicId"
  const [trendView, setTrendView] = useState<TrendView>("day");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isPinnedDrawerOpen, setIsPinnedDrawerOpen] = useState(false);
  
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

  // Map topics to inject backend status (isConfirmed & linkedDocsCount) for the sidebar and detail panels
  const mappedTopics = useMemo(() => {
    return allTopics.map((topic) => {
      const evidenceDocIds = topic.evidence_document_ids ?? [];
      const linkedDocsCount = evidenceDocIds.length;
      const isConfirmed = topic.knowledge_updated;

      return {
        ...topic,
        linkedDocsCount,
        isConfirmed,
      };
    });
  }, [allTopics]);

  const mappedSelectedTopic = useMemo(() => {
    if (!selectedTopic) return null;
    const evidenceDocIds = selectedTopic.evidence_document_ids ?? [];
    const isConfirmed = selectedTopic.knowledge_updated;

    return {
      ...selectedTopic,
      linkedDocIds: evidenceDocIds,
      isConfirmed,
    };
  }, [selectedTopic]);

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
      discarded,
      evidenceDocumentIds,
      pinnedPostIds,
    }: {
      resultId: string;
      topicId: number;
      pinned?: boolean;
      knowledgeUpdated?: boolean;
      discarded?: boolean;
      evidenceDocumentIds?: number[];
      pinnedPostIds?: string[];
    }) =>
      topicService.updatePin(resultId, topicId, {
        pinned,
        knowledge_updated: knowledgeUpdated,
        discarded,
        evidence_document_ids: evidenceDocumentIds,
        pinned_post_ids: pinnedPostIds,
      }),
    onSuccess: (_, variables) => {
      if (variables.pinned !== undefined) {
        toast.success(variables.pinned ? "Đã đánh dấu ghim bài thành công!" : "Đã bỏ ghim");
      }
      if (variables.knowledgeUpdated !== undefined) {
        toast.success(
          variables.knowledgeUpdated
            ? "Đã xác nhận cập nhật tri thức thành công!"
            : "Đã bỏ đánh dấu tri thức"
        );
      }
      if (variables.evidenceDocumentIds !== undefined) {
        toast.success("Đã cập nhật tài liệu minh chứng thành công!");
      }
      if (variables.pinnedPostIds !== undefined && variables.pinned === undefined) {
        toast.success("Đã cập nhật danh sách bài ghim liên kết!");
      }
      if (variables.discarded !== undefined) {
        toast.success(variables.discarded ? "Đã loại bỏ chủ đề" : "Đã khôi phục chủ đề");
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

  const handleDiscardTopic = () => {
    if (!selectedTopic) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      discarded: !selectedTopic.discarded,
    });
  };

  const handleLinkDoc = (docId: number) => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.evidence_document_ids ?? [];
    if (currentIds.includes(docId)) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      evidenceDocumentIds: [...currentIds, docId],
    });
  };

  const handleUnlinkDoc = (docId: number) => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.evidence_document_ids ?? [];
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      evidenceDocumentIds: currentIds.filter((id) => id !== docId),
    });
  };

  const handleConfirmKnowledgeUpdate = () => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.evidence_document_ids ?? [];
    if (currentIds.length === 0) {
      toast.error("Không thể xác nhận vì chưa có tài liệu liên kết!");
      return;
    }
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      knowledgeUpdated: true,
    });
  };

  const handleLinkPinnedPost = (postId: string) => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.pinned_post_ids ?? [];
    if (currentIds.includes(postId)) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      pinnedPostIds: [...currentIds, postId],
    });
  };

  const handleUnlinkPinnedPost = (postId: string) => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.pinned_post_ids ?? [];
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      pinnedPostIds: currentIds.filter((id) => id !== postId),
    });
  };

  const handleConfirmPin = () => {
    if (!selectedTopic) return;
    const currentIds = selectedTopic.pinned_post_ids ?? [];
    if (currentIds.length === 0) {
      toast.error("Không thể ghim vì chưa có bài ghim nào được liên kết!");
      return;
    }
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      pinned: true,
      pinnedPostIds: currentIds,
    });
    setIsPinnedDrawerOpen(false);
  };

  const handleUnpin = () => {
    if (!selectedTopic) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      pinned: false,
      pinnedPostIds: [],
    });
    setIsPinnedDrawerOpen(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="-m-4 flex h-[calc(100vh-40px)] flex-col overflow-hidden bg-background-light text-base md:-m-6 relative">
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] ${
          showPipelineModal ? "select-none blur-xs" : ""
        }`}
      >
        <TopicDetailPanel
          isLoading={isLoadingTopics}
          isError={isTopicsError}
          selectedTopic={mappedSelectedTopic as any}
          topicType={topicType}
          trendView={trendView}
          isPinning={pinMutation.isPending && pinMutation.variables?.pinned !== undefined}
          isUpdatingKnowledge={
            pinMutation.isPending && pinMutation.variables?.knowledgeUpdated !== undefined
          }
          isDiscarding={pinMutation.isPending && pinMutation.variables?.discarded !== undefined}
          onTrendViewChange={setTrendView}
          onPinTopic={handlePinTopic}
          onUpdateKnowledge={handleUpdateKnowledge}
          onDiscardTopic={handleDiscardTopic}
          // Dynamic document and status props
          linkedDocs={new Array(mappedSelectedTopic?.linkedDocIds?.length ?? 0).fill({})}
          isConfirmed={mappedSelectedTopic ? mappedSelectedTopic.isConfirmed : false}
          onOpenKnowledgeDrawer={() => setIsDrawerOpen(true)}
          onOpenPinnedPostDrawer={() => setIsPinnedDrawerOpen(true)}
        />
        {/* Left: topic list panel — filters by topic_type client-side */}
        <TopicListPanel
          isLoading={isLoadingTopics}
          isError={isTopicsError}
          topics={mappedTopics}
          selectedTopicKey={selectedKey}
          currentJob={currentJob ?? null}
          onTopicSelect={(key) => setSelectedKey(key)}
          onOpenPipelineModal={() => setShowPipelineModal(true)}
          onRetry={refetchTopics}
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

      {/* Knowledge Drawer (covering TopicListPanel on the right side of the entire layout container) */}
      {mappedSelectedTopic && (
        <KnowledgeDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          topicTitle={mappedSelectedTopic.title}
          linkedDocIds={mappedSelectedTopic.linkedDocIds}
          onLinkDoc={handleLinkDoc}
          onUnlinkDoc={handleUnlinkDoc}
          isConfirmed={mappedSelectedTopic.isConfirmed}
          onConfirm={() => {
            handleConfirmKnowledgeUpdate();
            setIsDrawerOpen(false);
          }}
        />
      )}

      {/* Pinned Post Drawer */}
      {mappedSelectedTopic && (
        <PinnedPostDrawer
          isOpen={isPinnedDrawerOpen}
          onClose={() => setIsPinnedDrawerOpen(false)}
          topicTitle={mappedSelectedTopic.title}
          linkedPinnedPostIds={mappedSelectedTopic.pinned_post_ids || []}
          onLinkPinnedPost={handleLinkPinnedPost}
          onUnlinkPinnedPost={handleUnlinkPinnedPost}
          isConfirmed={mappedSelectedTopic.pinned}
          onConfirm={handleConfirmPin}
          onUnpin={handleUnpin}
        />
      )}
    </div>
  );
}

export default function TopicPage() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            staleTime: 5 * 60 * 1000,
            gcTime: 30 * 60 * 1000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TopicPageContent />
    </QueryClientProvider>
  );
}
