"use client";

import React, { useState, useEffect, useRef } from "react";
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

export function CitationPdfPreview({ pdfData, fileName, highlightText }: CitationPdfPreviewProps) {
	const [numPages, setNumPages] = useState(0);
	const [scale, setScale] = useState(1.0);
	const [containerWidth, setContainerWidth] = useState<number | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<number>(0);
	const [currentResult, setCurrentResult] = useState(0);
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

		return () => {
			if (pdfBlobUrl) {
				URL.revokeObjectURL(pdfBlobUrl);
			}
		};
	}, []);

	useEffect(() => {
		if (pdfData) {
			try {
				// Ensure base64 is clean
				const base64 = pdfData.replace(/^data:application\/pdf;base64,/, "");
				const binaryString = atob(base64);
				const bytes = new Uint8Array(binaryString.length);
			for (let i = 0; i < binaryString.length; i++) {
				bytes[i] = binaryString.charCodeAt(i);
			}
				const blob = new Blob([bytes], { type: "application/pdf" });
				const url = URL.createObjectURL(blob);
				setPdfBlobUrl(url);

				return () => URL.revokeObjectURL(url);
			} catch (e) {
				console.error("Failed to process PDF data:", e);
			}
		}
	}, [pdfData]);

	// Auto search when highlightText changes and PDF is loaded
	useEffect(() => {
		if (highlightText && highlightText.length > 0 && numPages > 0 && pdfBlobUrl) {
			// Find meaningful fragments to search for
			const searchTerms = highlightText.flatMap(t => {
				// Split into lines and take the first few lines that have enough content
				return t.split("\n")
					.map(line => line.trim())
					.filter(line => line.length > 20)
					.slice(0, 3); // Take up to 3 long lines per chunk
			}).filter(Boolean);
			
			if (searchTerms.length > 0) {
				const firstTerm = searchTerms[0];
				setSearchQuery(firstTerm);
				
				// Trigger search after a delay to let text layer render for all pages
				const timer = setTimeout(() => {
					if (containerRef.current) {
						let found = false;
						// Try to find any of the terms
						for (const term of searchTerms) {
							if ((window as any).find(term, false, false, true, false, true, false)) {
								found = true;
								setSearchQuery(term);
								setSearchResults(1);
								setCurrentResult(1);
								break;
							}
						}
					}
				}, 2000);
				return () => clearTimeout(timer);
			}
		}
	}, [highlightText, numPages, pdfBlobUrl]);

	const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
		setNumPages(numPages);
	};

	const handleSearch = () => {
		if (!searchQuery.trim() || !containerRef.current) return;
		
		const found = (window as any).find(searchQuery, false, false, true, false, true, false);
		if (found) {
			setCurrentResult((prev) => prev + 1);
		} else {
			// Reset to first if no more results
			const foundFirst = (window as any).find(searchQuery, false, false, true, false, false, false);
			if (foundFirst) {
				setCurrentResult(1);
			}
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
		<div className="flex flex-col h-full" ref={containerRef}>
			<div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground truncate max-w-[200px]">{fileName}</span>
					{searchResults > 0 && (
						<span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">
							{currentResult}/{searchResults}
						</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					<div className="flex items-center">
						<Input
							placeholder="Tìm trong PDF..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleSearch();
							}}
							className="h-7 w-[150px] text-xs"
						/>
						<Button
							variant="ghost"
							size="sm"
							className="h-7 px-2"
							onClick={handleSearch}
						>
							<Search className="size-3" />
						</Button>
					</div>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2"
						disabled={scale <= 0.4}
						onClick={() => setScale((s) => Math.max(0.4, s - 0.1))}
					>
						<ZoomOut className="size-3" />
					</Button>
					<span className="text-xs min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-7 px-2"
						disabled={scale >= 2}
						onClick={() => setScale((s) => Math.min(2, s + 0.1))}
					>
						<ZoomIn className="size-3" />
					</Button>
				</div>
			</div>
			<div className="flex-1 overflow-auto bg-gray-100 p-2">
				<PdfDocument
					file={pdfBlobUrl}
					onLoadSuccess={onDocumentLoadSuccess}
				>
					{Array.from({ length: numPages }, (_, i) => (
						<div key={i} className="mb-6 flex justify-center w-full">
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