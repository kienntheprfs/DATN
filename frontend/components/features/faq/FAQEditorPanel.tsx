"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { faqApi, FAQ, CreateFAQPayload, UpdateFAQPayload } from "@/services/faq-api";

interface FAQEditorPanelProps {
  editingId: number | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function FAQEditorPanel({ editingId, onSaved, onCancel }: FAQEditorPanelProps) {
  const [answer, setAnswer] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);

  const { data: existingFAQ } = useQuery({
    queryKey: ["faq", editingId],
    queryFn: () => (editingId ? faqApi.get(editingId) : null),
    enabled: !!editingId,
  });

  useEffect(() => {
    if (existingFAQ) {
      setAnswer(existingFAQ.answer);
      setQuestions(existingFAQ.questions.map((q) => q.question));
    }
  }, [existingFAQ]);

  const createMutation = useMutation({
    mutationFn: async (payload: CreateFAQPayload) => {
      return faqApi.create(payload);
    },
    onSuccess: () => {
      toast.success("Đã tạo FAQ thành công.");
      onSaved();
    },
    onError: () => {
      toast.error("Không thể tạo FAQ. Vui lòng thử lại.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: UpdateFAQPayload) => {
      if (!editingId) throw new Error("No ID");
      return faqApi.update(editingId, payload);
    },
    onSuccess: () => {
      toast.success("Đã cập nhật FAQ thành công.");
      onSaved();
    },
    onError: () => {
      toast.error("Không thể cập nhật FAQ. Vui lòng thử lại.");
    },
  });

  const isLoading = createMutation.isPending || updateMutation.isPending;

  const handleAddQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const handleQuestionChange = (index: number, value: string) => {
    const updated = [...questions];
    updated[index] = value;
    setQuestions(updated);
  };

  const handleSubmit = () => {
    if (!answer.trim()) {
      toast.error("Vui lòng nhập câu trả lời.");
      return;
    }

    const validQuestions = questions.filter((q) => q.trim());
    if (validQuestions.length === 0) {
      toast.error("Vui lòng nhập ít nhất một câu hỏi.");
      return;
    }

    const payload = {
      answer: answer.trim(),
      questions: validQuestions,
    };

    if (editingId) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="gap-1.5 text-primary hover:bg-muted h-auto px-3 py-1 text-sm font-semibold"
        >
          <ArrowLeft className="w-5 h-5" />
          Quay lại
        </Button>
      </div>

      <h1 className="text-2xl font-bold text-foreground tracking-tight mb-6">
        {editingId ? "Chỉnh sửa FAQ" : "Tạo FAQ mới"}
      </h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Câu trả lời <span className="text-destructive">*</span>
          </label>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Nhập câu trả lời cho câu hỏi thường gặp..."
            className="min-h-[150px]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-foreground">
              Các câu hỏi <span className="text-destructive">*</span>
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddQuestion}
              className="gap-1 h-8"
            >
              <Plus className="w-3 h-3" />
              Thêm câu hỏi
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Thêm các biến thể câu hỏi để chatbot có thể nhận diện tốt hơn.
          </p>
          <div className="space-y-2">
            {questions.map((q, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={q}
                  onChange={(e) => handleQuestionChange(index, e.target.value)}
                  placeholder={`Câu hỏi biến thể ${index + 1}...`}
                  className="flex-1"
                />
                {questions.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveQuestion(index)}
                    className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button variant="outline" onClick={onCancel} disabled={isLoading}>
            Hủy
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? "Đang xử lý..." : editingId ? "Cập nhật" : "Tạo mới"}
          </Button>
        </div>
      </div>
    </div>
  );
}