"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import { Loader2, ZoomIn, ZoomOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PdfDocument = dynamic(
	() => import("react-pdf").then((mod) => mod.Document),
	{ ssr: false, loading: () => <div className="flex items-center justify-center p-4"><Loader2 className="size-6 animate-spin" /></div> }
);
const PdfPage = dynamic(
	() => import("react-pdf").then((mod) => mod.Page),
	{ ssr: false }
);

import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

interface CitationPdfPreviewProps {
	pdfData: string;
	fileName: string;
	highlightText?: string[];
}

// Unicode-aware normalize: NFC normalization + preserves Vietnamese chars via /u flag
function normalize(s: string): string {
	return s.toLowerCase().normalize('NFC').replace(/[^\w]/gu, '');
}

// Apply yellow highlights to PDF text layer spans matching the given terms
function applyHighlights(container: HTMLElement, terms: string[], signal?: { cancelled: boolean }) {
	const textLayers = container.querySelectorAll('.react-pdf__Page__textContent, .textLayer');
	console.log(`[PDF Highlight] Text layers found: ${textLayers.length}`);
	if (!textLayers.length) return { count: 0, totalSpans: 0, reason: 'no_text_layers' };

	// Split multi-word terms into individual words, keep only distinctive (longer) words
	const termWords = [...new Set(
		terms.flatMap(t =>
			t.normalize('NFC').toLowerCase()
				.split(/[\s,;:.!?()]+/)
				.map(w => w.replace(/[^\w]/gu, ''))
				.filter(w => w.length > 3)
		)
	)].sort((a, b) => b.length - a.length).slice(0, 30);

	if (!termWords.length) return { count: 0, totalSpans: 0, reason: 'no_term_words' };

	console.log(`[PDF Highlight] Terms: ${terms.length}, Words: ${termWords.length} (longest first)`, termWords);

	let totalSpans = 0;
	let highlighted = 0;

	textLayers.forEach(layer => {
		const spans = layer.querySelectorAll<HTMLElement>('span');
		totalSpans += spans.length;
		spans.forEach(span => {
			if (signal?.cancelled) return;
			if (span.hasAttribute('data-highlighted')) return;
			const text = (span.textContent || '').normalize('NFC').toLowerCase().replace(/[^\w]/gu, '');
			if (!text || text.length < 2) return;

			// Exact word match only — avoids false positives from short substring matches
			const isMatch = termWords.includes(text);

			if (isMatch) {
				span.setAttribute('data-highlighted', 'true');
				span.style.backgroundColor = 'rgba(255, 230, 0, 0.45)';
				span.style.borderBottom = '2px solid rgba(255, 200, 0, 0.8)';
				span.style.borderRadius = '2px';
				highlighted++;
			}
		});
	});

	console.log(`[PDF Highlight] Result: ${highlighted}/${totalSpans} spans, words:`, termWords);
	return { count: highlighted, totalSpans, reason: 'ok' };
}

export function CitationPdfPreview({ pdfData, fileName, highlightText }: CitationPdfPreviewProps) {
	const [numPages, setNumPages] = useState(0);
	const [scale, setScale] = useState(1.0);
	const [containerWidth, setContainerWidth] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [highlightReady, setHighlightReady] = useState(false);
	const [highlightInfo, setHighlightInfo] = useState<string>("");
	const highlightAttemptedRef = useRef(false);
	const cancelHighlightRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (containerRef.current) {
			const resizeObserver = new ResizeObserver(entries => {
				for (let entry of entries) {
					if (entry.contentRect.width > 0) {
						setContainerWidth(entry.contentRect.width);
					}
				}
			});
			resizeObserver.observe(containerRef.current);
			return () => resizeObserver.disconnect();
		}
	}, []);

	useEffect(() => {
		async function setupPdfJs() {
			if (typeof window === "undefined") return;
			try {
				const mod = await import("react-pdf");
				mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
				setIsLoading(false);
			} catch (e) {
				console.error("Failed to load PDF worker:", e);
				setIsLoading(false);
			}
		}
		setupPdfJs();
	}, []);

	useEffect(() => {
		if (pdfData) {
			try {
				const base64 = pdfData.replace(/^data:application\/pdf;base64,/, "");
				const binaryString = atob(base64);
				const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
				const blob = new Blob([bytes], { type: "application/pdf" });
				const url = URL.createObjectURL(blob);

				setPdfBlobUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return url;
				});
				setHighlightReady(false);
				setHighlightInfo("");
				highlightAttemptedRef.current = false;
				cancelHighlightRef.current = false;

				return () => URL.revokeObjectURL(url);
			} catch (e) {
				console.error("Failed to process PDF data:", e);
			}
		}
	}, [pdfData]);

	const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
		setNumPages(numPages);
		setHighlightReady(false);
		setHighlightInfo("");
		highlightAttemptedRef.current = false;
		cancelHighlightRef.current = false;
	};

	// Prepare terms from highlightText
	const terms = useMemo(() => {
		if (!highlightText?.length) {
			console.log("[PDF Highlight] No highlightText provided");
			return [];
		}
		console.log(`[PDF Highlight] Received ${highlightText.length} highlight chunks`);
		const result = highlightText.flatMap(t =>
			t.split('\n')
				.map(l => l.trim())
				.filter(l => l.length > 5)
				.slice(0, 5)
		).filter(Boolean);
		console.log(`[PDF Highlight] Generated ${result.length} terms from chunks`);
		return result;
	}, [highlightText]);

	const doHighlight = useCallback(() => {
		if (!containerRef.current) return { count: 0, totalSpans: 0, reason: 'no_container' };
		const sig = { cancelled: false };
		cancelHighlightRef.current = false;
		const result = applyHighlights(containerRef.current, terms, sig);
		return result;
	}, [terms]);

	// Poll for text layers and apply highlights when all pages are ready
	useEffect(() => {
		if (!numPages || !pdfBlobUrl || highlightAttemptedRef.current) return;
		if (!terms.length) {
			setHighlightInfo("Không có từ khóa để tô");
			setHighlightReady(true);
			highlightAttemptedRef.current = true;
			return;
		}

		let attempts = 0;
		const maxAttempts = 60;
		let cancelled = false;

		const tryHighlight = () => {
			if (cancelled || highlightAttemptedRef.current || !containerRef.current) return;
			attempts++;

			const textLayers = containerRef.current.querySelectorAll('.react-pdf__Page__textContent, .textLayer');
			const layersWithSpans = Array.from(textLayers).filter(
				layer => layer.querySelectorAll('span').length > 0
			).length;

			if (layersWithSpans >= numPages) {
				const result = applyHighlights(containerRef.current!, terms);
				if (result.count > 0) setSearchQuery(terms[0]);
				setHighlightInfo(`${result.count} highlights / ${result.totalSpans} spans`);
				setHighlightReady(true);
				highlightAttemptedRef.current = true;
				console.log(`[PDF Highlight] Done: ${result.count}/${result.totalSpans} spans on ${layersWithSpans} pages`);
			} else if (attempts < maxAttempts) {
				setTimeout(tryHighlight, 500);
			} else {
				setHighlightInfo(`Timeout: ${layersWithSpans}/${numPages} pages (${textLayers.length} layers)`);
				setHighlightReady(true);
				highlightAttemptedRef.current = true;
			}
		};

		const timer = setTimeout(tryHighlight, 1000);
		return () => { cancelled = true; clearTimeout(timer); };
	}, [numPages, pdfBlobUrl, terms]);

	// Scroll to first highlight when ready
	useEffect(() => {
		if (!highlightReady || !containerRef.current) return;

		const firstHighlighted = containerRef.current.querySelector('[data-highlighted]');
		if (firstHighlighted) {
			firstHighlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}, [highlightReady]);

	const handleManualHighlight = () => {
		setHighlightReady(false);
		setHighlightInfo("");
		highlightAttemptedRef.current = false;
		setTimeout(() => {
			const result = doHighlight();
			setHighlightInfo(`${result.count} highlights / ${result.totalSpans} spans`);
			setHighlightReady(true);
			highlightAttemptedRef.current = true;
		}, 500);
	};

	const handleSearch = () => {
		if (!searchQuery.trim() || !containerRef.current) return;
		try {
			containerRef.current.querySelector(searchQuery);
		} catch {
			// ignore invalid selector
		}
	};

	if (isLoading || !pdfBlobUrl) {
		return (
			<div className="flex items-center justify-center p-8">
				<Loader2 className="size-6 animate-spin mr-2" />
				<span>Đang tải PDF viewer...</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full min-h-0" ref={containerRef}>
			<div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
				<div className="flex items-center gap-2 min-w-0">
					<span className="text-xs text-muted-foreground truncate max-w-[160px]">{fileName}</span>
					{highlightReady && highlightInfo && (
						<span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded shrink-0">
							{highlightInfo}
						</span>
					)}
					{highlightReady && !highlightInfo && (
						<span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded shrink-0">
							Sẵn sàng
						</span>
					)}
				</div>
				<div className="flex items-center gap-1 shrink-0">
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-1.5 text-xs"
						onClick={handleManualHighlight}
						title="Thử tô highlights lại"
					>
						Tô lại
					</Button>
					<div className="flex items-center">
						<Input
							placeholder="Tìm..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSearch();
							}}
							className="h-7 w-[100px] text-xs"
						/>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-1.5"
							onClick={handleSearch}
						>
							<Search className="size-3" />
						</Button>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-1.5"
						disabled={scale <= 0.4}
						onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}
					>
						<ZoomOut className="size-3" />
					</Button>
					<span className="text-xs min-w-[35px] text-center">{Math.round(scale * 100)}%</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-1.5"
						disabled={scale >= 2}
						onClick={() => setScale((s) => Math.min(2, s + 0.1))}
					>
						<ZoomIn className="size-3" />
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-y-auto bg-gray-100 p-2">
				<PdfDocument
					file={pdfBlobUrl}
					onLoadSuccess={onDocumentLoadSuccess}
				>
					{Array.from({ length: numPages }, (_, i) => (
						<div key={`${i}-${scale}`} className="mb-6 flex justify-center w-full">
							<div className="shadow-2xl border bg-white rounded-md overflow-hidden ring-1 ring-black/5">
								<PdfPage
									pageNumber={i + 1}
									width={containerWidth ? Math.min(containerWidth - 60, 1100) : undefined}
									scale={scale}
									renderTextLayer={true}
									renderAnnotationLayer={true}
									loading={<div className="h-[400px] flex items-center justify-center bg-muted/10"><Loader2 className="animate-spin text-muted-foreground" /></div>}
								/>
							</div>
						</div>
					))}
				</PdfDocument>
			</div>
		</div>
	);
}
