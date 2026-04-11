"use client";

import { useEffect, useMemo, useState } from "react";

import { TOPICS } from "./TopicData";
import { PipelineConfirmModal } from "./PipelineConfirmModal";
import { TopicDetailPanel } from "./TopicDetailPanel";
import { TopicListPanel } from "./TopicListPanel";
import type { PipelineRange, TopicFilter, TrendView } from "./TopicTypes";

export default function TopicPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<TopicFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTopicId, setSelectedTopicId] = useState(TOPICS[0].id);
  const [trendView, setTrendView] = useState<TrendView>("day");
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [pipelineRange, setPipelineRange] = useState<PipelineRange>("24h");
  const [isRunningPipeline, setIsRunningPipeline] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isUpdatingKnowledge, setIsUpdatingKnowledge] = useState(false);
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

  const itemsPerPage = 4;

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 1100);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredTopics = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return TOPICS.filter((topic) => {
      const matchesSearch =
        normalized.length === 0 ||
        topic.title.toLowerCase().includes(normalized) ||
        topic.summary.toLowerCase().includes(normalized);

      const matchesFilter =
        activeFilter === "all" ||
        (activeFilter === "popular" && topic.queries > 60000) ||
        (activeFilter === "missing-knowledge" && !topic.knowledgeUpdated);

      return matchesSearch && matchesFilter;
    });
  }, [activeFilter, search]);

  const totalPages = Math.max(1, Math.ceil(filteredTopics.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedTopics = useMemo(() => {
    const start = (safeCurrentPage - 1) * itemsPerPage;
    return filteredTopics.slice(start, start + itemsPerPage);
  }, [filteredTopics, safeCurrentPage]);

  const selectedTopic = useMemo(() => {
    return (
      filteredTopics.find((topic) => topic.id === selectedTopicId) ??
      filteredTopics[0] ??
      TOPICS.find((topic) => topic.id === selectedTopicId) ??
      TOPICS[0]
    );
  }, [filteredTopics, selectedTopicId]);

  const sortedQuestions = useMemo(() => {
    const questions = [...selectedTopic.rawQuestions];
    questions.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortDirection === "desc" ? timeB - timeA : timeA - timeB;
    });

    return questions;
  }, [selectedTopic.rawQuestions, sortDirection]);

  const pageInfoText = `Page ${safeCurrentPage} of ${totalPages}`;

  const handleFilterChange = (filter: TopicFilter) => {
    setActiveFilter(filter);
    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleRunPipeline = async () => {
    setIsRunningPipeline(true);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setIsRunningPipeline(false);
    setShowPipelineModal(false);
  };

  const handlePinTopic = async () => {
    setIsPinning(true);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    setIsPinning(false);
  };

  const handleUpdateKnowledge = async () => {
    setIsUpdatingKnowledge(true);
    await new Promise((resolve) => window.setTimeout(resolve, 1200));
    setIsUpdatingKnowledge(false);
  };

  return (
    <div className="-m-4 flex min-h-[calc(100vh-60px)] flex-col overflow-hidden bg-background-light md:-m-6">
      <div className={`grid min-h-0 flex-1 grid-cols-1 xl:grid-cols-[350px_minmax(0,1fr)] ${showPipelineModal ? "select-none blur-xs" : ""}`}>
        <TopicListPanel
          isLoading={isLoading}
          search={search}
          activeFilter={activeFilter}
          filteredCount={filteredTopics.length}
          paginatedTopics={paginatedTopics}
          selectedTopicId={selectedTopic.id}
          pageInfoText={pageInfoText}
          isFirstPage={safeCurrentPage === 1}
          isLastPage={safeCurrentPage === totalPages}
          onSearchChange={handleSearchChange}
          onFilterChange={handleFilterChange}
          onTopicSelect={setSelectedTopicId}
          onOpenPipelineModal={() => setShowPipelineModal(true)}
          onPrevPage={() => setCurrentPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
          onNextPage={() => setCurrentPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
        />

        <TopicDetailPanel
          isLoading={isLoading}
          selectedTopic={selectedTopic}
          trendView={trendView}
          sortedQuestions={sortedQuestions}
          isPinning={isPinning}
          isUpdatingKnowledge={isUpdatingKnowledge}
          onTrendViewChange={setTrendView}
          onToggleSortDirection={() => setSortDirection((prev) => (prev === "desc" ? "asc" : "desc"))}
          onPinTopic={handlePinTopic}
          onUpdateKnowledge={handleUpdateKnowledge}
        />
      </div>

      {showPipelineModal && (
        <PipelineConfirmModal
          pipelineRange={pipelineRange}
          isRunningPipeline={isRunningPipeline}
          onRangeChange={setPipelineRange}
          onClose={() => {
            if (!isRunningPipeline) {
              setShowPipelineModal(false);
            }
          }}
          onConfirm={handleRunPipeline}
        />
      )}
    </div>
  );
}
