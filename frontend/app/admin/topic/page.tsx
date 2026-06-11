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
import { JobHistoryDrawer } from "@/components/admin/topic/JobHistoryDrawer";
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
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  
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
    queryKey: ["topics", "list", "missing_knowledge", selectedResultId],
    queryFn: () => topicService.getTopicList("missing_knowledge", selectedResultId ?? undefined),
    select: (data) => data.items,
  });

  const {
    data: popularList,
    isLoading: isLoadingPopular,
    isError: isErrorPopular,
    refetch: refetchPopular,
  } = useQuery({
    queryKey: ["topics", "list", "popular_questions", selectedResultId],
    queryFn: () => topicService.getTopicList("popular_questions", selectedResultId ?? undefined),
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
      setSelectedResultId(null); // Reset to latest when triggering new job
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

  const handleUnconfirmKnowledge = () => {
    if (!selectedTopic) return;
    pinMutation.mutate({
      resultId: selectedTopic.result_id,
      topicId: selectedTopic.topic_id,
      knowledgeUpdated: false,
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
    <div className="topic-page-container -m-4 flex h-[calc(100vh-40px)] flex-col overflow-hidden bg-background-light text-sm md:-m-6 relative font-sans">
      <style dangerouslySetInnerHTML={{ __html: `
        .topic-page-container p,
        .topic-page-container span,
        .topic-page-container div,
        .topic-page-container button,
        .topic-page-container input,
        .topic-page-container table,
        .topic-page-container td,
        .topic-page-container th,
        .topic-drawer-container p,
        .topic-drawer-container span,
        .topic-drawer-container div,
        .topic-drawer-container button,
        .topic-drawer-container input {
          font-size: 13px !important;
        }
        .topic-page-container h1,
        .topic-page-container .text-3xl {
          font-size: 20px !important;
        }
        .topic-page-container .text-2xl {
          font-size: 16px !important;
        }
        .topic-page-container h2,
        .topic-page-container h3,
        .topic-page-container h4,
        .topic-drawer-container h1,
        .topic-drawer-container h4 {
          font-size: 14px !important;
        }
        /* Scoped font-size adjustments for list panel */
        .topic-list-panel p,
        .topic-list-panel div,
        .topic-list-panel span,
        .topic-list-panel button,
        .topic-list-panel input {
          font-size: 12.5px !important;
        }
        .topic-list-panel h2 {
          font-size: 11.5px !important;
        }
        .topic-list-panel h3 {
          font-size: 12.5px !important;
        }
        .topic-list-panel .filter-btn {
          font-size: 11.5px !important;
        }
        .topic-list-panel .topic-queries {
          font-size: 10.5px !important;
        }
        .topic-list-panel .topic-summary {
          font-size: 11.5px !important;
        }
        .topic-list-panel .sync-ago {
          font-size: 11px !important;
        }
        .topic-list-panel .warning-banner,
        .topic-list-panel .warning-banner span,
        .topic-list-panel .warning-banner button {
          font-size: 11.5px !important;
        }
        .topic-list-panel .footer-btn,
        .topic-list-panel .footer-btn span {
          font-size: 11.5px !important;
        }
        /* Scoped font-size adjustments for detail panel contents */
        .topic-page-container .featured-entity-content {
          font-size: 20px !important;
        }
        .topic-page-container .primary-keyword-tag {
          font-size: 14.5px !important;
        }
        .topic-page-container .questions-table td {
          font-size: 14.5px !important;
        }
        .topic-page-container .questions-table th {
          font-size: 13.5px !important;
        }
      `}} />
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
          selectedResultId={selectedResultId}
          onClearResultId={() => {
            setSelectedResultId(null);
            setSelectedKey(null);
          }}
          onTopicSelect={(key) => setSelectedKey(key)}
          onOpenPipelineModal={() => setShowPipelineModal(true)}
          onOpenHistoryDrawer={() => setIsHistoryDrawerOpen(true)}
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
          onUnconfirm={handleUnconfirmKnowledge}
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

      {/* Job History Drawer */}
      <JobHistoryDrawer
        isOpen={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        topicType={topicType}
        onSelectJobResult={(resultId) => {
          setSelectedResultId(resultId);
          setSelectedKey(null); // Reset selection to auto-select first topic of the past run
          setIsHistoryDrawerOpen(false);
          toast.success("Đã tải dữ liệu kết quả từ lần chạy được chọn.");
        }}
      />
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
