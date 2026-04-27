"use client";

import { useState, useMemo, memo, useEffect } from "react";
import { X, Search, FileText, ChevronDown, ChevronUp, ExternalLink, Loader2, File, Highlighter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CitationPdfPreview } from "./citation-pdf-preview";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Citation {
	file_name: string;
	s3_url: string;
	text_preview?: string;
	source_type: string;
	doc_id?: string;
	file_path?: string;
	is_faq?: boolean;
	faq_source?: string;
}

type PreviewData = {
	isPdf: boolean;
	content: string;
	contentType?: string;
};

interface DocumentPanelProps {
	onClose: () => void;
	citations?: Citation[];
	toolChunks?: { source: string; content: string }[];
	routeData?: {
		type: string;
		[key: string]: unknown;
	} | null;
}

function inferExtension(name?: string | null): string {
	if (!name) return "";
	const parts = name.toLowerCase().split(".");
	return parts.length > 1 ? parts[parts.length - 1] : "";
}

const HighlightTextWithChunk = memo(({ text, chunks }: { text: string; chunks?: string[] }) => {
	const parts = useMemo(() => {
		if (!text || !chunks || chunks.length === 0) return [text];

		// Escape regex special characters
		const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		// Sort chunks by length (longest first) to avoid partial matches
		const sortedChunks = [...chunks].sort((a, b) => b.length - a.length);
		
		// Create a pattern that allows non-word characters and whitespace between words of each chunk
		const pattern = sortedChunks
			.map(c => {
				const escaped = escapeRegExp(c);
				// Split by whitespace and rejoin with a flexible pattern that allows non-word chars (bullets, punctuation)
				return escaped.split(/\s+/).filter(Boolean).join('[\\s\\W]{0,15}');
			})
			.filter(Boolean)
			.join('|');
		
		if (!pattern) return [text];

		try {
			const regex = new RegExp(`(${pattern})`, 'gi');
			return text.split(regex);
		} catch (e) {
			console.error("Regex error:", e);
			return [text];
		}
	}, [text, chunks]);

	const lowerChunks = useMemo(() => (chunks || []).map(c => c.toLowerCase().replace(/[\W_]+/g, '')), [chunks]);

	return (
		<>
			{parts.map((part, i) => {
				const normalizedPart = part.toLowerCase().replace(/[\W_]+/g, '');
				const isMatch = normalizedPart.length > 3 && lowerChunks.some(chunk => {
					return normalizedPart.includes(chunk) || chunk.includes(normalizedPart);
				});
				
				return isMatch ? (
					<span key={i} className="bg-yellow-200/80 px-0.5 rounded font-medium border-b border-yellow-400">
						{part}
					</span>
				) : (
					part
				);
			})}
		</>
	);
});
const CitationItem = memo(({ 
	cite, 
	isExpanded, 
	isLoading, 
	hasError, 
	preview, 
	isPdf, 
	isMarkdown,
	allChunks,
	onToggle, 
	onOpenPdf 
}: { 
	cite: Citation; 
	isExpanded: boolean; 
	isLoading: boolean; 
	hasError: boolean; 
	preview?: PreviewData; 
	isPdf: boolean; 
	isMarkdown: boolean;
	allChunks: string[];
	onToggle: () => void; 
	onOpenPdf: (chunks: string[]) => void;
}) => {
	const relevantChunks = useMemo(() => {
		const rawContent = preview?.content || cite.text_preview || "";
		if (!rawContent || allChunks.length === 0) return [];
		
		// Normalize both for comparison: lowercase and strip non-alphanumeric
		const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[\W_]+/g, '');
		
		const normalizedDoc = normalizeForCompare(rawContent);
		return allChunks.filter(chunk => {
			const normalizedChunk = normalizeForCompare(chunk);
			return normalizedChunk.length > 5 && normalizedDoc.includes(normalizedChunk);
		});
	}, [preview?.content, cite.text_preview, allChunks]);

	return (
		<div className="border rounded-lg overflow-hidden">
			<button
				onClick={onToggle}
				className="w-full text-left p-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
			>
				<div className="flex items-center gap-2 min-w-0 flex-1">
					{isPdf ? (
						<File className="size-4 text-red-500 shrink-0" />
					) : (
						<FileText className="size-4 text-blue-500 shrink-0" />
					)}
					<span className="text-sm font-medium text-blue-800 truncate">{cite.file_name}</span>
					<span className="text-xs px-2 py-0.5 bg-blue-200 text-blue-700 rounded shrink-0">{cite.source_type}</span>
				</div>
				{isExpanded ? (
					<ChevronUp className="size-4 text-muted-foreground shrink-0 ml-2" />
				) : (
					<ChevronDown className="size-4 text-muted-foreground shrink-0 ml-2" />
				)}
			</button>

			{isExpanded && (
				<div className="p-3 border-t bg-muted/30">
					{isLoading ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="size-4 animate-spin" />
							Đang tải nội dung...
						</div>
					) : hasError ? (
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">Không thể tải nội dung</p>
							{cite.s3_url && cite.s3_url !== "#" && (
								<Button
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										window.open(cite.s3_url, "_blank");
									}}
								>
									<ExternalLink className="size-4 mr-1" />
									Xem chi tiết
								</Button>
							)}
						</div>
					) : preview?.isPdf ? (
						<div className="flex items-center justify-between p-3 bg-red-50 rounded border border-red-200">
							<div>
								<p className="text-sm font-medium text-red-800">Tài liệu PDF</p>
								<p className="text-xs text-red-600">Nhấp để mở overlay</p>
							</div>
							<Button
								variant="ghost"
								size="sm"
								onClick={(e) => {
									e.stopPropagation();
									onOpenPdf(relevantChunks);
								}}
							>
								<ExternalLink className="size-4 mr-1" />
								Mở PDF
							</Button>
						</div>
					) : isMarkdown ? (
						<div className="text-sm prose prose-sm dark:prose-invert max-w-none bg-background/50 p-3 rounded-md border">
							<ReactMarkdown remarkPlugins={[remarkGfm]}>
								{preview?.content || cite.text_preview || ""}
							</ReactMarkdown>
							<div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-2">
								<Highlighter className="size-3" />
								Lưu ý: Highlight có thể không hiển thị đầy đủ trong chế độ Markdown
							</div>
						</div>
					) : preview?.content || cite.text_preview ? (
						<div>
							<div className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-15 leading-relaxed">
								<HighlightTextWithChunk 
									text={preview?.content || cite.text_preview || ""} 
									chunks={relevantChunks}
								/>
							</div>
							{cite.s3_url && cite.s3_url !== "#" && (
								<Button
									variant="ghost"
									size="sm"
									className="mt-2"
									onClick={(e) => {
										e.stopPropagation();
										window.open(cite.s3_url, "_blank");
									}}
								>
									<ExternalLink className="size-4 mr-1" />
									Xem toàn bộ
								</Button>
							)}
						</div>
					) : isPdf ? (
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">Tài liệu PDF</p>
							{cite.s3_url && cite.s3_url !== "#" && (
								<Button
									variant="ghost"
									size="sm"
									onClick={(e) => {
										e.stopPropagation();
										window.open(cite.s3_url, "_blank");
									}}
								>
									<ExternalLink className="size-4 mr-1" />
									Xem PDF
								</Button>
							)}
						</div>
					) : (
						<div className="flex items-center justify-between">
							<p className="text-sm text-muted-foreground">Không có nội dung</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
});

export function DocumentPanel({ onClose, citations, toolChunks, routeData }: DocumentPanelProps) {
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedCitations, setExpandedCitations] = useState<Set<string>>(new Set());
	const [previews, setPreviews] = useState<Record<string, PreviewData>>({});
	const [loadingPreviews, setLoadingPreviews] = useState<Set<string>>(new Set());
	const [errorPreviews, setErrorPreviews] = useState<Set<string>>(new Set());
	const [pdfModal, setPdfModal] = useState<{ pdfData: string; fileName: string; highlightText: string[] } | null>(null);

	// Get all chunks combined for matching
	const allChunks = useMemo(() => toolChunks?.map(c => c.content) || [], [toolChunks]);

	const filteredCitations = useMemo(() => citations?.filter(
		(cite) =>
			!searchQuery.trim() ||
			cite.file_name.toLowerCase().includes(searchQuery.toLowerCase())
	), [citations, searchQuery]);

	const isMarkdownFile = (cite: Citation): boolean => {
		return cite.s3_url?.toLowerCase().endsWith(".md") || 
			inferExtension(cite.file_name) === "md" ||
			cite.source_type === "markdown";
	};

	const isPdfFile = (cite: Citation): boolean => {
		return cite.s3_url?.toLowerCase().endsWith(".pdf") || 
			inferExtension(cite.file_name) === "pdf";
	};

	const toggleCitation = async (cite: Citation) => {
		const key = cite.file_name;
		const newExpanded = new Set(expandedCitations);

		if (expandedCitations.has(key)) {
			newExpanded.delete(key);
		} else {
			newExpanded.add(key);
			// If it's a PDF, we want to open it immediately
			if (isPdfFile(cite)) {
				if (previews[key]) {
					// Already loaded, open now
					openPdfWithHighlights(cite, previews[key].content);
				} else {
					// Not loaded, fetch and then open
					fetchPreview(cite, true);
				}
			} else if (!previews[key] && !loadingPreviews.has(key) && cite.s3_url && cite.s3_url !== "#") {
				fetchPreview(cite);
			}
		}
		setExpandedCitations(newExpanded);
	};

	const openPdfWithHighlights = (cite: Citation, pdfContent: string) => {
		const rawContent = pdfContent || cite.text_preview || "";
		const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[\W_]+/g, '');
		const normalizedDoc = normalizeForCompare(rawContent);
		
		const relevantChunks = allChunks.filter(chunk => {
			const normalizedChunk = normalizeForCompare(chunk);
			return normalizedChunk.length > 5 && normalizedDoc.includes(normalizedChunk);
		});

		setPdfModal({
			pdfData: pdfContent,
			fileName: cite.file_name,
			highlightText: relevantChunks,
		});
	};

	const fetchPreview = async (cite: Citation, autoOpenPdf = false) => {
		const key = cite.file_name;
		setLoadingPreviews((prev) => new Set(prev).add(key));
		setErrorPreviews((prev) => {
			const next = new Set(prev);
			next.delete(key);
			return next;
		});

		try {
			const response = await fetch("/api/proxy-file", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ url: cite.s3_url }),
			});
			if (!response.ok) throw new Error("Failed to fetch");
			const data = await response.json();
			if (data.error) throw new Error(data.error);
			setPreviews((prev) => ({ ...prev, [key]: data }));
			
			if (autoOpenPdf && data.content) {
				openPdfWithHighlights(cite, data.content);
			}
		} catch {
			setErrorPreviews((prev) => new Set(prev).add(key));
		} finally {
			setLoadingPreviews((prev) => {
				const next = new Set(prev);
				next.delete(key);
				return next;
			});
		}
	};

	return (
		<div className="flex flex-col h-full bg-background">
			<div className="flex items-center justify-between p-4 border-b shrink-0">
				<h2 className="text-lg font-semibold">Tài liệu tham khảo</h2>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="size-5" />
				</Button>
			</div>

			<div className="p-4 border-b shrink-0">
				<div className="relative">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
					<Input
						placeholder="Tìm kiếm trong tài liệu..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="pl-9"
					/>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto">
				{citations && citations.length > 0 ? (
					<div className="p-4 space-y-2">
						{filteredCitations?.map((cite, idx) => (
							<CitationItem 
								key={cite.file_name + idx}
								cite={cite}
								isExpanded={expandedCitations.has(cite.file_name)}
								isLoading={loadingPreviews.has(cite.file_name)}
								hasError={errorPreviews.has(cite.file_name)}
								preview={previews[cite.file_name]}
								isPdf={isPdfFile(cite)}
								isMarkdown={isMarkdownFile(cite)}
								allChunks={allChunks}
								onToggle={() => toggleCitation(cite)}
								onOpenPdf={(chunks) => setPdfModal({
									pdfData: previews[cite.file_name].content,
									fileName: cite.file_name,
									highlightText: chunks,
								})}
							/>
						))}
					</div>
				) : (
					<div className="p-4 text-center text-muted-foreground text-sm">
						Chưa có tài liệu tham khảo nào
					</div>
				)}
			</div>

			{pdfModal && (
				<div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-8">
					<div className="bg-background rounded-xl shadow-2xl w-full max-w-6xl h-full flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
						<div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
							<div className="flex items-center gap-2">
								<File className="size-5 text-red-500" />
								<h3 className="font-semibold text-lg truncate max-w-[300px] md:max-w-md">{pdfModal.fileName}</h3>
							</div>
							<Button variant="ghost" size="icon" onClick={() => setPdfModal(null)} className="rounded-full hover:bg-red-100 hover:text-red-600 transition-colors">
								<X className="size-5" />
							</Button>
						</div>
						<div className="flex-1 overflow-hidden relative bg-gray-200/50">
							<CitationPdfPreview 
								pdfData={pdfModal.pdfData} 
								fileName={pdfModal.fileName}
								highlightText={pdfModal.highlightText}
							/>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}