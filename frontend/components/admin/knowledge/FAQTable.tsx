"use client";

import React from "react";
import type { FAQ } from "@/services/faq-api";

interface FAQTableProps {
  faqs: FAQ[];
  isLoading: boolean;
  onEdit: (faq: FAQ) => void;
  onDelete: (id: number) => void;
}

export function FAQTable({ faqs, isLoading, onEdit, onDelete }: FAQTableProps) {
  return (
    <div className="bg-surface rounded-md border border-border-color shadow-sm flex flex-col overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full divide-y divide-border-color">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-20">ID</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading">Câu hỏi</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading">Câu trả lời</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-32">Nguồn</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-text-secondary uppercase tracking-wider font-heading w-24">Phiên bản câu hỏi</th>
              <th scope="col" className="relative px-6 py-3 w-24">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-border-color">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-6 py-4">
                    <div className="h-4 bg-slate-200 rounded w-8"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-slate-200 rounded w-3/4"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-slate-200 rounded w-20"></div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="h-4 bg-slate-200 rounded w-12"></div>
                  </td>
                  <td className="px-6 py-4"></td>
                </tr>
              ))
            ) : faqs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-text-secondary">
                  Chưa có câu hỏi thường gặp nào
                </td>
              </tr>
            ) : (
              faqs.map((faq) => (
                <tr key={faq.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-xs font-mono text-text-secondary bg-slate-100 px-1.5 py-0.5 rounded inline-block border border-slate-200">
                      {faq.id}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-text-main">
                      {faq.questions[0]?.question || "—"}
                    </div>
                    {faq.questions.length > 1 && (
                      <div className="text-xs text-text-secondary mt-1">
                        +{faq.questions.length - 1} biến thể
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-text-main line-clamp-2 max-w-md">
                      {faq.answer}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-800 border border-blue-100">
                      {faq.source}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-text-secondary">
                      {faq.questions.length}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="text-slate-400 hover:text-primary transition-colors p-1"
                        title="Chỉnh sửa"
                        onClick={() => onEdit(faq)}
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                      <button
                        className="text-slate-400 hover:text-red-600 transition-colors p-1"
                        title="Xóa"
                        onClick={() => {
                          if (confirm("Bạn có chắc chắn muốn xóa câu hỏi này?")) {
                            onDelete(faq.id);
                          }
                        }}
                      >
                        <span className="material-symbols-outlined text-xl">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { FAQTableProps };