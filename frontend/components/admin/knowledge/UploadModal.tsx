"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { knowledgeService } from "@/services/knowledge-api";
import { PdfPreviewPanel } from "./PdfPreviewPanel";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploaded?: () => void;
}

type DocumentClass = "normal" | "formal";

interface UploadFileItem {
  id: string;
  file: File;
  documentClass: DocumentClass;
  summary: string;
  code: string;
  signedDate: string;
  unit: string;
  documentType: string;
  tagsInput: string;
  isPreviewOpen: boolean;
}

const DEFAULT_UNIT = "Phòng Đào Tạo";
const DEFAULT_KIND = "Quyết định";

function createUploadItem(file: File): UploadFileItem {
  const uniqueId = `${file.name}-${file.size}-${file.lastModified}`;
  return {
    id: uniqueId,
    file,
    documentClass: "normal",
    summary: "",
    code: "",
    signedDate: "",
    unit: DEFAULT_UNIT,
    documentType: DEFAULT_KIND,
    tagsInput: "",
    isPreviewOpen: true,
  };
}

export function UploadModal({ isOpen, onClose, onUploaded }: UploadModalProps) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<UploadFileItem[]>([]);
  const [expandedFileIdx, setExpandedFileIdx] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [processingLabel, setProcessingLabel] = useState("Đang chuẩn bị...");

  const uploadMutation = useMutation({
    mutationFn: async (items: UploadFileItem[]) => {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        setProcessingLabel(`Đang tải lên: ${item.file.name}`);
        const tags = item.tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean);
        const signedYear = item.signedDate ? new Date(item.signedDate).getFullYear() : undefined;

        await knowledgeService.uploadDocument({
          file: item.file,
          isFormalDoc: item.documentClass === "formal",
          metaData: {
            summary: item.summary || undefined,
            code: item.code || undefined,
            signed_date: item.signedDate || undefined,
            signed_year: Number.isFinite(signedYear) ? signedYear : undefined,
            unit: item.unit || undefined,
            document_type: item.documentType || undefined,
            tags,
            document_group: item.documentClass,
          },
        });

        const currentProgress = Math.round(((index + 1) / items.length) * 100);
        setProgress(currentProgress);
      }
    },
    onSuccess: () => {
      toast.success("Đã gửi tài liệu vào hàng đợi xử lý thành công.");
      queryClient.invalidateQueries({ queryKey: ["admin-knowledge-documents"] });
      onUploaded?.();
      
      // Đóng modal sau khi upload thành công
      setFiles([]);
      setExpandedFileIdx(null);
      setProgress(0);
      setProcessingLabel("Đang chuẩn bị...");
      onClose();
      
      // Reset mutation state after closing
      setTimeout(() => {
        uploadMutation.reset();
      }, 300);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Không thể tải lên tài liệu.";
      toast.error(message);
      setProcessingLabel("Tải lên thất bại.");
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const appended = Array.from(e.target.files as FileList)
          .map(createUploadItem)
          .filter((item) => !existingIds.has(item.id));
        return [...prev, ...appended];
      });
    }
  };

  const removeFile = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleExpand = (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    setExpandedFileIdx(expandedFileIdx === idx ? null : idx);
  };

  const isProcessing = uploadMutation.isPending || (uploadMutation.isSuccess && progress > 0);

  const processingDone = useMemo(() => progress >= 100 && uploadMutation.isSuccess, [progress, uploadMutation.isSuccess]);

  const resetModalState = () => {
    setFiles([]);
    setExpandedFileIdx(null);
    setProgress(0);
    setProcessingLabel("Đang chuẩn bị...");
    uploadMutation.reset();
  };

  const handleClose = () => {
    if (uploadMutation.isPending) {
      toast.info("Upload đang chạy, vui lòng chờ hoàn tất.");
      return;
    }
    resetModalState();
    onClose();
  };

  const handleStartProcessing = () => {
    if (files.length === 0) return;
    setProgress(0);
    uploadMutation.mutate(files);
  };

  const stepLabels = [
    "Tải lên tệp tin...",
    "Kiểm tra định dạng PDF...",
    "Trích xuất tri thức bằng AI...",
  ];

  const secondStepDone = progress >= 40;

  if (!isOpen) return null;

  return (
    <div 
      className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div 
        className="bg-white w-200 shadow-2xl border border-border-color flex flex-col max-h-[90vh]" 
        style={{ borderRadius: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-color bg-slate-50/50 shrink-0">
          <h2 className="font-heading font-semibold text-lg text-text-main">
            Tải lên văn bản mới
          </h2>
          <button onClick={handleClose} className="text-text-secondary hover:text-text-main transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {isProcessing ? (
            <div>
              <div className="flex justify-between items-end mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-primary text-[20px] shrink-0">description</span>
                  <span className="font-medium text-text-main text-sm truncate">
                    {processingLabel}
                  </span>
                </div>
                <span className="text-sm font-mono font-medium text-primary">{progress}%</span>
              </div>

              <div className="h-2 w-full bg-slate-100 rounded-sm overflow-hidden mb-6">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>

              <div className="space-y-3 pl-1">
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                  </div>
                  <span className="text-text-secondary line-through decoration-slate-300">{stepLabels[0]}</span>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  {secondStepDone ? (
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                    </div>
                  ) : (
                    <span className="material-symbols-outlined text-primary animate-spin text-[20px]">progress_activity</span>
                  )}
                  <span className={secondStepDone ? "text-text-secondary line-through decoration-slate-300" : "font-medium text-text-main"}>
                    {stepLabels[1]}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  {processingDone ? (
                    <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                      <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                    </div>
                  ) : (
                    <span className="material-symbols-outlined text-primary animate-spin text-[20px]">progress_activity</span>
                  )}
                  <span className={processingDone ? "text-text-secondary line-through decoration-slate-300" : "font-medium text-text-main"}>
                    {stepLabels[2]}
                  </span>
                </div>
              </div>
            </div>
          ) : (
          <>
          {/* Upload Dropzone */}
          <div
            className="border-2 border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group mb-6"
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) {
                setFiles((prev) => {
                  const existingIds = new Set(prev.map((item) => item.id));
                  const appended = Array.from(e.dataTransfer.files)
                    .map(createUploadItem)
                    .filter((item) => !existingIds.has(item.id));
                  return [...prev, ...appended];
                });
              }
            }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <div className="flex items-center gap-3 mb-3 opacity-60 group-hover:opacity-100 transition-opacity">
                <span className="material-symbols-outlined text-4xl text-slate-400">cloud_upload</span>
              </div>
              <p className="text-sm text-text-main font-medium mb-2">
                Kéo thả các tệp vào đây hoặc
              </p>
              <label className="bg-white border border-slate-300 text-primary px-4 py-1.5 rounded-md shadow-sm text-sm font-medium hover:bg-blue-50 hover:border-blue-200 transition-all cursor-pointer">
                Chọn tệp từ thiết bị
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={handleFileSelect}
                />
              </label>
              <p className="text-xs text-slate-400 mt-3">Hỗ trợ: PDF, DOC, DOCX, TXT, MD (Tối đa 25MB mỗi tệp)</p>
            </div>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
                <h3 className="text-sm font-bold text-text-secondary uppercase font-heading">
                  Danh sách tệp tin ({files.length})
                </h3>
              </div>

              <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-slate-700">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-[18px] text-blue-700 shrink-0">info</span>
                  <div>
                    <p className="font-semibold text-blue-900">Hướng dẫn chọn nhóm tài liệu</p>
                    <ul className="mt-1 leading-relaxed space-y-2">
                    <li>
                      <strong>Normal document:</strong> Các tài liệu giới thiệu trường Đại học Bách Khoa, thông tin chung, không cần liên kết chặt chẽ.
                    </li>
                    <li>
                      <strong>Formal document:</strong> Các văn bản luật, văn bản hành chính do trường ban hành, có tham chiếu giữa các điều khoản/văn bản với nhau nên chi phí xử lý cao hơn.
                    </li>
                  </ul>
                  </div>
                </div>
              </div>

              {files.map((file, idx) => {
                const isPdf = file.file.name.toLowerCase().endsWith(".pdf");
                const Icon = isPdf ? "picture_as_pdf" : "description";
                const iconColor = isPdf ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600";
                
                return (
                  <div key={idx} className="border border-slate-200 rounded-md bg-white overflow-hidden shadow-sm transition-all hover:border-blue-200 hover:shadow-md">
                    <div 
                      className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-100"
                      onClick={(e) => toggleExpand(e, idx)}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 ${iconColor}`}>
                          <span className="material-symbols-outlined text-[18px]">{Icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-text-main truncate pr-2">
                            {file.file.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{(file.file.size / 1024 / 1024).toFixed(1)} MB</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">check_circle</span>
                              Sẵn sàng
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button className="text-slate-400 hover:text-slate-600 p-1" onClick={(e) => toggleExpand(e, idx)}>
                          <span className="material-symbols-outlined text-[20px]">
                            {expandedFileIdx === idx ? "expand_less" : "expand_more"}
                          </span>
                        </button>
                        <button className="text-slate-400 hover:text-red-600 p-1" onClick={(e) => removeFile(e, idx)}>
                          <span className="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {expandedFileIdx === idx && (
                      <div className="p-4 bg-white border-t border-slate-100" onClick={(e) => e.stopPropagation()}>
                        {/* <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 font-mono">
                          Preview template: {file.file.name}
                        </div> */}

                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-8">
                            <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                              Trích yếu nội dung <span className="text-red-500">*</span>
                            </label>
                            <textarea 
                              className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 resize-none h-22 p-2.5 transition-all" 
                              placeholder="Nhập tóm tắt nội dung chính..." 
                              rows={3}
                              value={file.summary}
                              onChange={(e) => {
                                const value = e.target.value;
                                setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, summary: value } : item));
                              }}
                            ></textarea>
                          </div>
                          <div className="col-span-4 flex flex-col gap-3">
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Nhóm tài liệu <span className="text-red-500">*</span>
                              </label>
                              <select
                                className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all"
                                value={file.documentClass}
                                onChange={(e) => {
                                  const value = e.target.value as DocumentClass;
                                  setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, documentClass: value } : item));
                                }}
                              >
                                <option value="normal">Normal document</option>
                                <option value="formal">Formal document</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Số hiệu văn bản <span className="text-red-500">*</span>
                              </label>
                              <input 
                                type="text" 
                                className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm placeholder-slate-400 px-3 py-2 transition-all" 
                                placeholder="Số hiệu..." 
                                value={file.code}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, code: value } : item));
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Ngày ký
                              </label>
                              <input 
                                type="date" 
                                className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all" 
                                value={file.signedDate}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, signedDate: value } : item));
                                }}
                              />
                            </div>
                          </div>
                          <div className="col-span-12 grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Đơn vị ban hành
                              </label>
                              <select
                                className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all"
                                value={file.unit}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, unit: value } : item));
                                }}
                              >
                                <option value="Phòng Đào Tạo">Phòng Đào Tạo</option>
                                <option value="P. CTCT-SV">P. CTCT-SV</option>
                                <option value="Phòng TCCB">Phòng TCCB</option>
                                <option value="Ban Giám Hiệu">Ban Giám Hiệu</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Loại văn bản
                              </label>
                              <select
                                className="block w-full border border-slate-300 rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm text-text-main px-3 py-2 transition-all"
                                value={file.documentType}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, documentType: value } : item));
                                }}
                              >
                                <option value="Quyết định">Quyết định</option>
                                <option value="Thông báo">Thông báo</option>
                                <option value="Quy chế">Quy chế</option>
                                <option value="Hướng dẫn">Hướng dẫn</option>
                                <option value="Formal document">Formal document</option>
                              </select>
                            </div>
                          </div>
                          <div className="col-span-12">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                              onClick={() => {
                                setFiles((prev) =>
                                  prev.map((item, itemIdx) =>
                                    itemIdx === idx
                                      ? { ...item, isPreviewOpen: !item.isPreviewOpen }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              <span className="material-symbols-outlined text-[16px]">
                                {file.isPreviewOpen ? "expand_less" : "expand_more"}
                              </span>
                              {file.isPreviewOpen ? "Thu gọn preview" : "Mở preview"}
                            </button>
                            {file.isPreviewOpen ? (
                              <div className="mt-2 h-90">
                                <PdfPreviewPanel file={file.file} fileName={file.file.name} />
                              </div>
                            ) : null}
                          </div>
                          <div className="col-span-12">
                            <div>
                              <label className="block text-xs font-semibold text-text-secondary uppercase mb-1.5">
                                Thẻ / Tags
                              </label>
                              <div className="border border-slate-300 rounded-md px-2 py-1 bg-white flex flex-wrap gap-1 min-h-9.5 items-center focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                                <input 
                                  type="text" 
                                  className="flex-1 border-none p-0 focus:ring-0 focus:outline-none text-sm placeholder-slate-400 min-w-15" 
                                  placeholder="Ví dụ: AI, Học vụ, Tuyển sinh" 
                                  value={file.tagsInput}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setFiles((prev) => prev.map((item, itemIdx) => itemIdx === idx ? { ...item, tagsInput: value } : item));
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-border-color flex justify-end gap-3 shrink-0">
          {uploadMutation.isPending ? (
            <button
              onClick={() => {
                toast.info("Upload đang chạy, vui lòng chờ hoàn tất.");
              }}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-slate-200 rounded-sm hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm"
            >
              Đang xử lý...
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-white border border-slate-300 rounded-md text-sm font-medium text-text-main shadow-sm hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleStartProcessing}
                disabled={files.length === 0 || uploadMutation.isPending}
                className="px-4 py-2 bg-primary text-white rounded-md text-sm font-medium shadow-sm hover:bg-blue-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">neurology</span>
                {processingDone ? "Đã hoàn tất" : `Bắt đầu xử lý AI ${files.length > 0 ? `(${files.length} tệp)` : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
