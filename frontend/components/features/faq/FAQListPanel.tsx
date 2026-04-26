"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Eye, X } from "lucide-react";
import { faqApi, FAQ, CreateFAQPayload, UpdateFAQPayload } from "@/services/faq-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CustomModal } from "./CustomModal";

interface FAQListPanelProps {
  searchQuery: string;
  isAdmin: boolean;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--/--/----";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

export function FAQListPanel({ searchQuery, isAdmin }: FAQListPanelProps) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const [detailFAQ, setDetailFAQ] = useState<FAQ | null>(null);
  const [createFAQOpen, setCreateFAQOpen] = useState(false);
  const [editFAQ, setEditFAQ] = useState<FAQ | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<FAQ | null>(null);

  const [formAnswer, setFormAnswer] = useState("");
  const [formQuestions, setFormQuestions] = useState<string[]>([""]);

  const faqsQuery = useQuery({
    queryKey: ["faqs"],
    queryFn: () => faqApi.list({ skip: 0, limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateFAQPayload) => {
      return faqApi.create(payload);
    },
    onSuccess: () => {
      toast.success("Đã tạo FAQ thành công.");
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setCreateFAQOpen(false);
      resetForm();
    },
    onError: () => {
      toast.error("Không thể tạo FAQ. Vui lòng thử lại.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: UpdateFAQPayload }) => {
      return faqApi.update(id, payload);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật FAQ thành công.");
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setEditFAQ(null);
      resetForm();
    },
    onError: () => {
      toast.error("Không thể cập nhật FAQ. Vui lòng thử lại.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await faqApi.delete(id);
    },
    onSuccess: () => {
      toast.success("Đã xóa FAQ thành công.");
      queryClient.invalidateQueries({ queryKey: ["faqs"] });
      setDeleteCandidate(null);
    },
    onError: () => {
      toast.error("Không thể xóa FAQ. Vui lòng thử lại.");
    },
  });

  const resetForm = () => {
    setFormAnswer("");
    setFormQuestions([""]);
  };

  const openEditModal = (faq: FAQ) => {
    setFormAnswer(faq.answer);
    setFormQuestions(faq.questions.map((q) => q.question));
    setEditFAQ(faq);
  };

  const handleAddQuestion = () => {
    setFormQuestions([...formQuestions, ""]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (formQuestions.length > 1) {
      setFormQuestions(formQuestions.filter((_, i) => i !== index));
    }
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...formQuestions];
    updated[index] = value;
    setFormQuestions(updated);
  };

  const handleSubmit = () => {
    if (!formAnswer.trim()) {
      toast.error("Vui lòng nhập câu trả lời.");
      return;
    }

    const validQuestions = formQuestions.filter((q) => q.trim());
    if (validQuestions.length === 0) {
      toast.error("Vui lòng nhập ít nhất một câu hỏi.");
      return;
    }

    const payload = {
      answer: formAnswer.trim(),
      questions: validQuestions,
    };

    if (editFAQ) {
      updateMutation.mutate({ id: editFAQ.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isFormLoading = createMutation.isPending || updateMutation.isPending;

  const allFAQs = faqsQuery.data?.items ?? [];
  const totalItems = allFAQs.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;

  const filteredFAQs = allFAQs.filter((faq) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    const questionMatch = faq.questions.some((q) => q.question.toLowerCase().includes(query));
    const answerMatch = faq.answer.toLowerCase().includes(query);
    return questionMatch || answerMatch;
  });

  const paginatedFAQs = filteredFAQs.slice(startIndex, startIndex + PAGE_SIZE);

  if (faqsQuery.isError) {
    return (
      <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        Không thể tải danh sách. Vui lòng{" "}
        <button onClick={() => faqsQuery.refetch()} className="font-semibold underline decoration-red-400 underline-offset-2">
          tải lại
        </button>
        .
      </div>
    );
  }

  return (
    <>
      {isAdmin && (
        <div className="mb-4">
          <Button onClick={() => setCreateFAQOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Thêm FAQ
          </Button>
        </div>
      )}

      <div className="bg-surface rounded-md border border-border-color shadow-subtle overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-border-color">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-bold text-text-secondary uppercase tracking-wider font-heading w-20">
                  ID
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-text-secondary uppercase tracking-wider font-heading">
                  Câu hỏi
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-text-secondary uppercase tracking-wider font-heading w-36">
                  Ngày tạo
                </th>
                <th className="px-6 py-4 text-left text-sm font-bold text-text-secondary uppercase tracking-wider font-heading w-28">
                  Biến thể
                </th>
                {isAdmin && (
                  <th className="px-6 py-4 text-right text-sm font-bold text-text-secondary uppercase tracking-wider font-heading w-32">
                    Hành động
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-border-color">
              {faqsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-6 py-5"><div className="h-5 w-10 bg-slate-200 rounded"></div></td>
                    <td className="px-6 py-5">
                      <div className="h-5 w-64 bg-slate-200 rounded mb-2"></div>
                      <div className="h-4 w-48 bg-slate-100 rounded"></div>
                    </td>
                    <td className="px-6 py-5"><div className="h-5 w-24 bg-slate-200 rounded"></div></td>
                    <td className="px-6 py-5"><div className="h-5 w-10 bg-slate-200 rounded"></div></td>
                    {isAdmin && <td className="px-6 py-5"><div className="h-5 w-20 bg-slate-200 rounded ml-auto"></div></td>}
                  </tr>
                ))
              ) : paginatedFAQs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="px-6 py-12 text-center text-text-secondary">
                    {searchQuery ? `Không tìm thấy "${searchQuery}"` : "Chưa có câu hỏi thường gặp nào"}
                  </td>
                </tr>
              ) : (
                paginatedFAQs.map((faq) => (
                  <tr key={faq.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-6 py-5">
                      <span className="text-sm font-mono text-text-secondary bg-slate-100 px-2 py-1 rounded border border-slate-200">
                        #{faq.id}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-base font-semibold text-primary line-clamp-1">
                          {faq.questions[0]?.question || `Câu hỏi #${faq.id}`}
                        </span>
                        <span className="text-sm text-text-secondary line-clamp-2">
                          {faq.answer.replace(/<[^>]*>/g, "").slice(0, 100)}...
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-base font-mono text-text-main">{formatDate(faq.created_at)}</span>
                    </td>
                    <td className="px-6 py-5">
                      <Badge variant="secondary" className="text-sm px-2.5 py-1">{faq.questions.length}</Badge>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-5 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setDetailFAQ(faq)}
                            className="p-2 rounded hover:bg-slate-200 text-slate-500 hover:text-primary transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => openEditModal(faq)}
                            className="p-2 rounded hover:bg-slate-200 text-slate-500 hover:text-primary transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Pencil className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setDeleteCandidate(faq)}
                            className="p-2 rounded hover:bg-red-50 text-slate-500 hover:text-red-600 transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-2">
          <span className="text-xs text-text-secondary">
            Hiển thị {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, totalItems)} trong {totalItems}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Trước
            </Button>
            <span className="text-sm text-text-secondary">{currentPage} / {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Sau
            </Button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <CustomModal
        isOpen={!!detailFAQ}
        onClose={() => setDetailFAQ(null)}
        title="Chi tiết FAQ"
        description="Xem thông tin chi tiết của câu hỏi thường gặp."
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDetailFAQ(null)}>Đóng</Button>
            {isAdmin && (
              <Button onClick={() => { setDetailFAQ(null); openEditModal(detailFAQ!); }}>Chỉnh sửa</Button>
            )}
          </div>
        }
      >
        {detailFAQ && (
          <div className="space-y-8">
            <div>
              <h3 className="text-lg font-semibold text-text-main mb-4">Các câu hỏi biến thể</h3>
              <div className="grid gap-3">
                {detailFAQ.questions.map((q, idx) => (
                  <div key={q.id || idx} className="flex items-start gap-4 p-4 bg-slate-50 rounded-lg border border-border-color">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="text-base font-medium text-text-main">{q.question}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-text-main mb-4">Câu trả lời</h3>
              <div className="p-6 bg-slate-50 rounded-lg border border-border-color">
                <div className="prose prose-lg max-w-none" dangerouslySetInnerHTML={{ __html: detailFAQ.answer }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 text-base">
              <div>
                <span className="text-text-secondary">Nguồn: </span>
                <span className="font-medium">{detailFAQ.source}</span>
              </div>
              <div>
                <span className="text-text-secondary">Ngày tạo: </span>
                <span className="font-mono">{formatDate(detailFAQ.created_at)}</span>
              </div>
            </div>
          </div>
        )}
      </CustomModal>

      {/* Create/Edit Modal */}
      <CustomModal
        isOpen={createFAQOpen || !!editFAQ}
        onClose={() => { setCreateFAQOpen(false); setEditFAQ(null); resetForm(); }}
        title={editFAQ ? "Chỉnh sửa FAQ" : "Tạo FAQ mới"}
        description={editFAQ ? "Cập nhật thông tin câu hỏi thường gặp." : "Điền thông tin để tạo câu hỏi thường gặp mới."}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setCreateFAQOpen(false); setEditFAQ(null); resetForm(); }} disabled={isFormLoading} className="px-6">
              Hủy
            </Button>
            <Button onClick={handleSubmit} disabled={isFormLoading} className="px-6">
              {isFormLoading ? "Đang xử lý..." : editFAQ ? "Cập nhật" : "Tạo mới"}
            </Button>
          </div>
        }
      >
        <div className="space-y-8">
          <div>
            <label className="block text-base font-medium text-text-main mb-3">
              Câu trả lời <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={formAnswer}
              onChange={(e) => setFormAnswer(e.target.value)}
              placeholder="Nhập câu trả lời cho câu hỏi thường gặp..."
              className="min-h-[200px] text-base p-4"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-base font-medium text-text-main">
                Các câu hỏi biến thể <span className="text-destructive">*</span>
              </label>
              <Button type="button" variant="outline" size="sm" onClick={handleAddQuestion} className="gap-2 h-9">
                <Plus className="w-4 h-4" /> Thêm
              </Button>
            </div>
            <p className="text-sm text-text-secondary mb-4">Thêm các biến thể để chatbot nhận diện tốt hơn.</p>
            <div className="space-y-3">
              {formQuestions.map((q, idx) => (
                <div key={idx} className="flex gap-3">
                  <div className="flex items-center justify-center w-8 h-10 bg-slate-100 rounded text-sm font-medium text-text-secondary shrink-0">
                    {idx + 1}
                  </div>
                  <Input
                    value={q}
                    onChange={(e) => handleQuestionChange(idx, e.target.value)}
                    placeholder={`Câu hỏi biến thể ${idx + 1}...`}
                    className="flex-1 h-10"
                  />
                  {formQuestions.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveQuestion(idx)} className="h-10 w-10 p-0">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </CustomModal>

      {/* Delete Modal */}
      <CustomModal
        isOpen={!!deleteCandidate}
        onClose={() => setDeleteCandidate(null)}
        title="Xác nhận xóa"
        size="md"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteCandidate(null)} disabled={deleteMutation.isPending}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={() => deleteCandidate && deleteMutation.mutate(deleteCandidate.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-base">
            Bạn có chắc chắn muốn xóa FAQ "{deleteCandidate?.questions[0]?.question}" không?
          </p>
          <p className="text-base text-destructive font-medium">Hành động này không thể hoàn tác.</p>
        </div>
      </CustomModal>
    </>
  );
}