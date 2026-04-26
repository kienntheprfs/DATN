"use client";

import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AxiosError } from "axios";
import { apiClient } from "@/services/auth-api";
import "react-pdf/dist/Page/TextLayer.css";

const PdfDocument = dynamic(
  () => import("react-pdf").then((mod) => mod.Document),
  { ssr: false },
);
const PdfPage = dynamic(
  () => import("react-pdf").then((mod) => mod.Page),
  { ssr: false },
);

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const ZOOM_STEP = 0.15;
const READABLE_TEXT_EXTENSIONS = new Set(["md", "markdown", "txt", "docx"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);

type RemotePreviewCacheItem =
  | { kind: "pdf"; blob: Blob; fileName: string }
  | { kind: "text"; text: string; fileName: string };

const remotePreviewCache = new Map<string, RemotePreviewCacheItem>();

interface PdfPreviewPanelProps {
  file: string | File | null;
  fileName?: string;
  className?: string;
  onLoadingStateChange?: (isLoading: boolean) => void;
}

function inferExtension(name?: string | null): string {
  if (!name) return "";
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

async function extractReadableText(fileBlob: Blob, name: string, contentType?: string): Promise<string | null> {
  const extension = inferExtension(name);
  const normalizedType = (contentType || "").toLowerCase();

  if (MARKDOWN_EXTENSIONS.has(extension) || extension === "txt" || normalizedType.startsWith("text/")) {
    return fileBlob.text();
  }

  if (extension === "docx" || normalizedType.includes("wordprocessingml.document")) {
    const mammoth = await import("mammoth");
    const arrayBuffer = await fileBlob.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value?.trim() || "";
  }

  return null;
}

export function PdfPreviewPanel({ file, fileName, className, onLoadingStateChange }: PdfPreviewPanelProps) {
  const [pageCount, setPageCount] = useState<number>(0);
  const [resolvedPdfFile, setResolvedPdfFile] = useState<string | File | null>(null);
  const [resolvedText, setResolvedText] = useState<string | null>(null);
  const [resolvedFileName, setResolvedFileName] = useState<string>(fileName || "");
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isPdfRuntimeReady, setIsPdfRuntimeReady] = useState(false);
  const [isPdfDocumentLoading, setIsPdfDocumentLoading] = useState(false);
  const [renderedPageCount, setRenderedPageCount] = useState(0);
  const [zoomScale, setZoomScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(840);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const deferredZoomScale = useDeferredValue(zoomScale);

  const previewCardRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let isCancelled = false;

    const setupPdfJs = async () => {
      if (typeof window === "undefined") return;
      const mod = await import("react-pdf");
      mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
      if (!isCancelled) {
        setIsPdfRuntimeReady(true);
      }
    };

    setupPdfJs();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!previewCardRef.current) return;

    const handleFullscreen = () => {
      setIsFullscreen(document.fullscreenElement === previewCardRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    const target = scrollContainerRef.current;
    if (!target) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        setContainerWidth(width);
      }
    });

    observer.observe(target);
    return () => observer.disconnect();
  }, [resolvedPdfFile, resolvedText]);

  const zoomWithAnchor = useCallback(
    (
      nextScale: number,
      anchor?: {
        clientX: number;
        clientY: number;
      },
    ) => {
      const clampedScale = clampZoom(nextScale);
      if (clampedScale === zoomScale) {
        return;
      }

      const container = scrollContainerRef.current;
      if (!container) {
        setZoomScale(clampedScale);
        return;
      }

      const rect = container.getBoundingClientRect();
      const localX = anchor ? anchor.clientX - rect.left : rect.width / 2;
      const localY = anchor ? anchor.clientY - rect.top : rect.height / 2;
      const sourceX = container.scrollLeft + localX;
      const sourceY = container.scrollTop + localY;
      const ratio = clampedScale / zoomScale;

      setZoomScale(clampedScale);

      requestAnimationFrame(() => {
        const activeContainer = scrollContainerRef.current;
        if (!activeContainer) {
          return;
        }

        activeContainer.scrollLeft = sourceX * ratio - localX;
        activeContainer.scrollTop = sourceY * ratio - localY;
      });
    },
    [zoomScale],
  );

  const onZoomIn = useCallback(
    (anchor?: { clientX: number; clientY: number }) => {
      zoomWithAnchor(zoomScale + ZOOM_STEP, anchor);
    },
    [zoomScale, zoomWithAnchor],
  );

  const onZoomOut = useCallback(
    (anchor?: { clientX: number; clientY: number }) => {
      zoomWithAnchor(zoomScale - ZOOM_STEP, anchor);
    },
    [zoomScale, zoomWithAnchor],
  );

  const onResetZoom = useCallback(() => {
    setZoomScale(1);
  }, []);

  useEffect(() => {
    const handleNativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        return;
      }

      const previewCard = previewCardRef.current;
      if (!previewCard) {
        return;
      }

      const eventTarget = event.target;
      if (!(eventTarget instanceof Node) || !previewCard.contains(eventTarget)) {
        return;
      }

      event.preventDefault();

      const delta = Math.max(-120, Math.min(120, event.deltaY));
      const zoomFactor = Math.exp(-delta * 0.0015);
      zoomWithAnchor(zoomScale * zoomFactor, { clientX: event.clientX, clientY: event.clientY });
    };

    window.addEventListener("wheel", handleNativeWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      window.removeEventListener("wheel", handleNativeWheel, true);
    };
  }, [zoomScale, zoomWithAnchor]);

  const isPreviewBusy =
    isFetchingPreview ||
    (Boolean(resolvedPdfFile) && (!isPdfRuntimeReady || isPdfDocumentLoading || renderedPageCount < pageCount));

  const onToggleFullscreen = async () => {
    if (isPreviewBusy) {
      return;
    }

    if (!previewCardRef.current) return;

    if (document.fullscreenElement === previewCardRef.current) {
      await document.exitFullscreen();
      return;
    }

    await previewCardRef.current.requestFullscreen();
  };

  useEffect(() => {
    onLoadingStateChange?.(isPreviewBusy);
  }, [isPreviewBusy, onLoadingStateChange]);

  useEffect(() => {
    let isUnmounted = false;
    let blobUrl: string | null = null;

    const resolvePreviewSource = async () => {
      setFetchError(null);
      setResolvedPdfFile(null);
      setResolvedText(null);
      setPageCount(0);
      setRenderedPageCount(0);
      setIsPdfDocumentLoading(false);
      setZoomScale(1);

      if (!file) {
        setResolvedFileName(fileName || "");
        return;
      }

      const localName = fileName || (file instanceof File ? file.name : file);
      setResolvedFileName(localName || "");
      const localExtension = inferExtension(localName);

      if (file instanceof File) {
        if (file.type === "application/pdf" || localExtension === "pdf") {
          setIsPdfDocumentLoading(true);
          setResolvedPdfFile(file);
          return;
        }

        if (READABLE_TEXT_EXTENSIONS.has(localExtension) || file.type.startsWith("text/")) {
          try {
            setIsFetchingPreview(true);
            const text = await extractReadableText(file, localName || file.name, file.type);
            if (!isUnmounted) {
              setResolvedText(text);
            }
          } catch {
            if (!isUnmounted) {
              setFetchError("Không thể đọc nội dung file để xem trước.");
            }
          } finally {
            if (!isUnmounted) {
              setIsFetchingPreview(false);
            }
          }
          return;
        }

        setFetchError("Định dạng này chưa hỗ trợ preview trực tiếp.");
        return;
      }

      try {
        setIsFetchingPreview(true);
        const requestUrl = file.startsWith("/api/") ? file.slice(4) : file;
        const cacheKey = `${requestUrl}::${localName || ""}`;
        const cached = remotePreviewCache.get(cacheKey);
        if (cached) {
          if (cached.kind === "pdf") {
            blobUrl = URL.createObjectURL(cached.blob);
            if (!isUnmounted) {
              setResolvedPdfFile(blobUrl);
              setIsPdfDocumentLoading(true);
            }
          } else if (!isUnmounted) {
            setResolvedText(cached.text);
          }
          return;
        }

        const response = await apiClient.get<Blob>(requestUrl, {
          responseType: "blob",
          headers: {
            Accept: "*/*",
          },
        });

        const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
        if (contentType.includes("application/pdf") || localExtension === "pdf") {
          remotePreviewCache.set(cacheKey, {
            kind: "pdf",
            blob: response.data,
            fileName: localName || "document.pdf",
          });
          blobUrl = URL.createObjectURL(response.data);
          if (!isUnmounted) {
            setResolvedPdfFile(blobUrl);
            setIsPdfDocumentLoading(true);
          }
          return;
        }

        if (READABLE_TEXT_EXTENSIONS.has(localExtension) || contentType.startsWith("text/")) {
          const text = await extractReadableText(response.data, localName || "", contentType);
          if (!isUnmounted) {
            setResolvedText(text);
          }
          remotePreviewCache.set(cacheKey, {
            kind: "text",
            text: text || "",
            fileName: localName || "document.txt",
          });
          return;
        }

        if (!isUnmounted) {
          setFetchError("Định dạng này chưa hỗ trợ preview trực tiếp.");
        }
      } catch (error) {
        if (!isUnmounted) {
          const axiosError = error as AxiosError;
          const status = axiosError.response?.status;
          if (status === 401 || status === 403) {
            setFetchError("Bạn không có quyền xem file này.");
          } else if (status === 404) {
            setFetchError("Không tìm thấy file trong hệ thống lưu trữ.");
          } else {
            setFetchError("Không thể tải file để xem trước.");
          }
        }
      } finally {
        if (!isUnmounted) {
          setIsFetchingPreview(false);
        }
      }
    };

    resolvePreviewSource();

    return () => {
      isUnmounted = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [file, fileName]);

  const isMarkdownContent = useMemo(() => {
    return MARKDOWN_EXTENSIONS.has(inferExtension(resolvedFileName));
  }, [resolvedFileName]);

  const pdfPageWidth = useMemo(() => {
    const safeWidth = Math.max(360, containerWidth - 32);
    return Math.floor(safeWidth * deferredZoomScale);
  }, [containerWidth, deferredZoomScale]);

  if (!file) {
    return (
      <div className={`flex h-full w-full items-center justify-center text-sm text-slate-500 ${className || ""}`}>
        Chưa có file để preview.
      </div>
    );
  }

  return (
    <div className={`flex h-full w-full flex-col ${className || ""}`}>
      <style>{`
        @keyframes knowledge-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-600">
        {isPreviewBusy ? (
          <div className="relative h-3.5 w-42 overflow-hidden rounded bg-slate-200">
            <span
              className="absolute inset-y-0 w-20 bg-linear-to-r from-transparent via-white/70 to-transparent"
              style={{ animation: "knowledge-shimmer 1.2s infinite" }}
            />
          </div>
        ) : (
          <span className="truncate" title={resolvedFileName}>
            {resolvedFileName || "document"}
          </span>
        )}

        {isPreviewBusy ? (
          <div className="relative h-3.5 w-20 overflow-hidden rounded bg-slate-200">
            <span
              className="absolute inset-y-0 w-12 bg-linear-to-r from-transparent via-white/70 to-transparent"
              style={{ animation: "knowledge-shimmer 1.2s infinite" }}
            />
          </div>
        ) : (
          <span>{resolvedPdfFile ? `Tổng ${pageCount || "?"} trang` : "Nội dung văn bản"}</span>
        )}
      </div>

      <div ref={previewCardRef} className="relative flex-1 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        <div ref={scrollContainerRef} className="h-full overflow-auto p-3 md:p-4">
          {isPreviewBusy ? (
            <div className="space-y-4 py-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`preview-skeleton-${index}`}
                  className="relative mx-auto h-56 max-w-3xl overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm"
                >
                  <span
                    className="absolute inset-y-0 w-24 bg-linear-to-r from-transparent via-slate-100 to-transparent"
                    style={{ animation: "knowledge-shimmer 1.2s infinite" }}
                  />
                </div>
              ))}
            </div>
          ) : null}
          {fetchError ? <div className="py-8 text-center text-sm text-red-600">{fetchError}</div> : null}

          {!isFetchingPreview && !fetchError && resolvedPdfFile && isPdfRuntimeReady ? (
            <PdfDocument
              file={resolvedPdfFile}
              loading={null}
              error={<div className="py-8 text-center text-sm text-red-600">Không thể mở file PDF.</div>}
              onLoadSuccess={({ numPages }) => {
                setPageCount(numPages);
                setRenderedPageCount(0);
                setIsPdfDocumentLoading(false);
              }}
              onLoadError={() => {
                setRenderedPageCount(0);
                setIsPdfDocumentLoading(false);
              }}
            >
              <div className="space-y-4">
                {Array.from({ length: pageCount || 0 }).map((_, index) => (
                  <div
                    key={`pdf-page-${index + 1}`}
                    className="mx-auto w-fit rounded-sm bg-white p-2 shadow-sm ring-1 ring-slate-200 transition-[width,transform] duration-150 ease-out will-change-transform"
                  >
                    <PdfPage
                      pageNumber={index + 1}
                      width={pdfPageWidth}
                      renderAnnotationLayer={false}
                      renderTextLayer
                      onRenderSuccess={() => {
                        setRenderedPageCount((prev) => Math.min(pageCount, prev + 1));
                      }}
                    />
                    <p className="pt-2 text-center text-[11px] font-medium text-slate-500">Trang {index + 1}</p>
                  </div>
                ))}
              </div>
            </PdfDocument>
          ) : null}

          {!isFetchingPreview && !fetchError && !resolvedPdfFile && resolvedText !== null ? (
            <div className="mx-auto max-w-4xl rounded-sm border border-slate-200 bg-white shadow-sm ring-1 ring-slate-100">
              <article
                className="p-5 leading-7 text-slate-800 transition-[transform,width] duration-150 ease-out will-change-transform"
                style={{
                  transform: `scale(${deferredZoomScale})`,
                  transformOrigin: "top center",
                  width: `${100 / deferredZoomScale}%`,
                }}
              >
                {isMarkdownContent ? (
                  <div className="space-y-3 text-sm [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:text-lg [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_pre]:overflow-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:p-2 [&_ul]:ml-4 [&_ul]:list-disc">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{resolvedText}</ReactMarkdown>
                  </div>
                ) : (
                  <pre className="wrap-break-word whitespace-pre-wrap font-sans text-sm text-slate-800">
                    {resolvedText || "Không có nội dung để hiển thị."}
                  </pre>
                )}
              </article>
            </div>
          ) : null}
        </div>

        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-md border border-slate-300 bg-white/95 p-1 shadow-lg backdrop-blur">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-slate-100"
            title="Thu nhỏ"
            onClick={onZoomOut}
            disabled={zoomScale <= MIN_ZOOM}
          >
            <span className="material-symbols-outlined text-[18px]">zoom_out</span>
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded px-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            title="Mặc định fit width"
            onClick={onResetZoom}
          >
            {Math.round(zoomScale * 100)}%
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-slate-100"
            title="Phóng to"
            onClick={onZoomIn}
            disabled={zoomScale >= MAX_ZOOM}
          >
            <span className="material-symbols-outlined text-[18px]">zoom_in</span>
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-slate-100"
            title={isFullscreen ? "Thoát toàn màn hình" : "Toàn màn hình"}
            onClick={onToggleFullscreen}
            disabled={isPreviewBusy}
          >
            <span className="material-symbols-outlined text-[18px]">{isFullscreen ? "fullscreen_exit" : "fullscreen"}</span>
          </button>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-500">
        Mẹo: dùng Ctrl + cuộn chuột/touchpad để phóng to hoặc thu nhỏ nhanh.
      </p>
    </div>
  );
}
