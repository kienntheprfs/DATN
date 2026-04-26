"use client";

import React, { useState, useEffect } from "react";
import { FAQ, CreateFAQPayload } from "@/services/faq-api";

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateFAQPayload) => void;
  faq?: FAQ | null;
}

export function FAQModal({ isOpen, onClose, onSubmit, faq }: FAQModalProps) {
  const [answer, setAnswer] = useState("");
  const [questions, setQuestions] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (faq) {
      setAnswer(faq.answer);
      setQuestions(faq.questions.map((q) => q.question));
    } else {
      setAnswer("");
      setQuestions([""]);
    }
  }, [faq, isOpen]);

  const handleAddQuestion = () => {
    setQuestions([...questions, ""]);
  };

  const handleRemoveQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const handleQuestionChange = (index: number, value: string) => {
    const newQuestions = [...questions];
    newQuestions[index] = value;
    setQuestions(newQuestions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || questions.filter((q) => q.trim()).length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({
        answer: answer.trim(),
        questions: questions.filter((q) => q.trim()),
      });
      setAnswer("");
      setQuestions([""]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setAnswer("");
    setQuestions([""]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-2xl shadow-2xl border border-border-color flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-slate-50/50 shrink-0">
          <h2 className="font-heading font-semibold text-lg text-text-main">
            {faq ? "Chỉnh sửa câu hỏi thường gặp" : "Thêm câu hỏi thường gặp"}
          </h2>
          <button onClick={handleClose} className="text-text-secondary hover:text-text-main transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-main mb-2">
              Câu trả lời <span className="text-red-500">*</span>
            </label>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 resize-none p-3 transition-all"
              placeholder="Nhập câu trả lời..."
              required
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-text-main">
                Các câu hỏi <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAddQuestion}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                Thêm câu hỏi
              </button>
            </div>
            <p className="text-xs text-text-secondary mb-3">
              Thêm nhiều biến thể của câu hỏi để cải thiện khả năng tìm kiếm
            </p>
            <div className="space-y-2">
              {questions.map((question, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => handleQuestionChange(index, e.target.value)}
                    className="flex-1 border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 px-3 py-2 transition-all"
                    placeholder={`Câu hỏi ${index + 1}...`}
                    required={index === 0}
                  />
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveQuestion(index)}
                      className="text-slate-400 hover:text-red-600 p-1 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-border-color flex justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-text-main shadow-sm hover:bg-slate-50 transition-colors"
          >
            Hủy
          </button>
          <button
            type="submit"
            formMethod="post"
            disabled={isSubmitting || !answer.trim() || questions.filter((q) => q.trim()).length === 0}
            className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium shadow-sm hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                Đang lưu...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">save</span>
                {faq ? "Cập nhật" : "Tạo mới"}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}