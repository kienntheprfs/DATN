"use client";

import React, { useMemo, useState } from "react";
import { DeletePinModal } from "@/components/admin/pinnedPost/DeletePinModal";
import { PinnedPostCreateView } from "@/components/admin/pinnedPost/PinnedPostCreateView";
import { PinnedPostListView } from "@/components/admin/pinnedPost/PinnedPostListView";
import { PinnedPostTabs } from "@/components/admin/pinnedPost/PinnedPostTabs";
import type {
	PinnedCategory,
	PinnedFormData,
	PinnedPost,
	PinnedSortMode,
} from "@/components/admin/pinnedPost/PinnedPostTypes";

const INITIAL_PINS: PinnedPost[] = [
	{
		id: "pin-1",
		order: 1,
		title: "Regulations on Student Assessment 2024",
		refId: "REF-QC-2024-001",
		category: "Quy chế Đào tạo",
		pinnedDate: "2023-10-15",
		summary: "Updated rules for course registration and graduation criteria for 2024.",
		sourceUrl: "https://hcmut.edu.vn/dao-tao/quy-dinh-2024",
		documentType: "Quy chế / Quyết định",
		tags: ["DAOTAO", "QUYDINH2024"],
	},
	{
		id: "pin-2",
		order: 2,
		title: "Guidelines for Graduate Thesis Submission",
		refId: "REF-HD-LV-042",
		category: "Sau Đại học",
		pinnedDate: "2023-10-12",
		summary: "Submission process and timeline for graduate thesis in semester 1.",
		sourceUrl: "https://hcmut.edu.vn/sau-dai-hoc/luan-van",
		documentType: "Hướng dẫn nghiệp vụ",
		tags: ["SAUDAIHOC", "LUANVAN"],
	},
	{
		id: "pin-3",
		order: 3,
		title: "Tuition Fee Support Policy (VNU-HCM)",
		refId: "VNU-CS-2023-88",
		category: "Công tác Sinh viên",
		pinnedDate: "2023-10-01",
		summary: "Support channels and aid conditions for students with tuition constraints.",
		sourceUrl: "https://hcmut.edu.vn/sinh-vien/hoc-phi",
		documentType: "Thông báo nội bộ",
		tags: ["CTSV", "HOTRO"],
	},
	{
		id: "pin-4",
		order: 4,
		title: "Research Ethics Board Application Process",
		refId: "REF-NCKH-2023",
		category: "Nghiên cứu Khoa học",
		pinnedDate: "2023-09-28",
		summary: "Ethics review process for proposals involving human-subject data.",
		sourceUrl: "https://hcmut.edu.vn/nghien-cuu/dao-duc",
		documentType: "Quy chế / Quyết định",
		tags: ["NCKH", "ETHICS"],
	},
];

const INITIAL_FORM: PinnedFormData = {
	title: "Quy định đào tạo trình độ đại học năm 2024",
	summary:
		"Văn bản cập nhật các thay đổi quan trọng về hình thức đăng ký học phần, điều kiện xét tốt nghiệp và các quy định bổ sung về thực tập ngoài trường dành cho sinh viên khóa 2021 trở đi.",
	documentType: "Quy chế / Quyết định",
	sourceUrl: "https://hcmut.edu.vn/dao-tao/quy-dinh-2024",
};

type PageMode = "list" | "create";

export default function PinnedPostPage() {
	const [mode, setMode] = useState<PageMode>("list");
	const [pins, setPins] = useState<PinnedPost[]>(INITIAL_PINS);
	const [search, setSearch] = useState("");
	const [category, setCategory] = useState<"all" | PinnedCategory>("all");
	const [sortMode, setSortMode] = useState<PinnedSortMode>("latest");
	const [currentPage, setCurrentPage] = useState(1);
	const [deleteCandidate, setDeleteCandidate] = useState<PinnedPost | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [form, setForm] = useState<PinnedFormData>(INITIAL_FORM);

	const itemsPerPage = 4;

	const filteredPins = useMemo(() => {
		const normalizedQuery = search.trim().toLowerCase();

		const results = pins.filter((item) => {
			const matchedSearch =
				normalizedQuery.length === 0 ||
				item.title.toLowerCase().includes(normalizedQuery) ||
				item.refId.toLowerCase().includes(normalizedQuery);
			const matchedCategory = category === "all" || item.category === category;
			return matchedSearch && matchedCategory;
		});

		if (sortMode === "alphabetical") {
			return [...results].sort((a, b) => a.title.localeCompare(b.title));
		}

		if (sortMode === "manual") {
			return [...results].sort((a, b) => a.order - b.order);
		}

		return [...results].sort((a, b) => b.pinnedDate.localeCompare(a.pinnedDate));
	}, [pins, search, category, sortMode]);

	const totalPages = Math.max(1, Math.ceil(filteredPins.length / itemsPerPage));
	const safeCurrentPage = Math.min(currentPage, totalPages);

	const pagedPins = useMemo(() => {
		const start = (safeCurrentPage - 1) * itemsPerPage;
		const end = start + itemsPerPage;
		return filteredPins.slice(start, end);
	}, [filteredPins, safeCurrentPage]);

	const topCategoryText = useMemo(() => {
		const countMap = pins.reduce<Record<string, number>>((acc, item) => {
			acc[item.category] = (acc[item.category] ?? 0) + 1;
			return acc;
		}, {});

		const top = Object.entries(countMap).sort((a, b) => b[1] - a[1])[0];
		return top?.[0] ?? "N/A";
	}, [pins]);

	const lastUpdateText = useMemo(() => {
		const latest = [...pins].sort((a, b) => b.pinnedDate.localeCompare(a.pinnedDate))[0];
		if (!latest) {
			return "N/A";
		}

		const [year, month, day] = latest.pinnedDate.split("-");
		return `${day}/${month}/${year}`;
	}, [pins]);

	const handleChangeForm = (field: keyof PinnedFormData, value: string) => {
		setForm((current) => ({ ...current, [field]: value }));
	};

	const handleSavePin = () => {
		if (!form.title.trim() || !form.summary.trim()) {
			return;
		}

		setIsSaving(true);

		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = `${today.getMonth() + 1}`.padStart(2, "0");
		const dd = `${today.getDate()}`.padStart(2, "0");
		const nextOrder = pins.length + 1;

		const newPin: PinnedPost = {
			id: `pin-${crypto.randomUUID()}`,
			order: nextOrder,
			title: form.title.trim(),
			refId: `REG-${yyyy}-${String(nextOrder).padStart(3, "0")}`,
			category: "Quy chế Đào tạo",
			pinnedDate: `${yyyy}-${mm}-${dd}`,
			summary: form.summary.trim(),
			sourceUrl: form.sourceUrl.trim() || "#",
			documentType: form.documentType,
			tags: ["DAOTAO", "PINNED"],
		};

		setTimeout(() => {
			setPins((current) => [newPin, ...current]);
			setMode("list");
			setSearch("");
			setCategory("all");
			setSortMode("latest");
			setCurrentPage(1);
			setForm(INITIAL_FORM);
			setIsSaving(false);
		}, 350);
	};

	const handleConfirmDelete = () => {
		if (!deleteCandidate) {
			return;
		}

		setIsDeleting(true);

		setTimeout(() => {
			setPins((current) => current.filter((item) => item.id !== deleteCandidate.id));
			setDeleteCandidate(null);
			setIsDeleting(false);
			setCurrentPage(1);
		}, 250);
	};

	const handleEdit = (item: PinnedPost) => {
		setForm({
			title: item.title,
			summary: item.summary,
			documentType: item.documentType,
			sourceUrl: item.sourceUrl,
		});
		setMode("create");
	};

	return (
		<>
			<div className="-m-4 flex min-h-[calc(100vh-60px)] flex-col overflow-auto bg-background-light px-4 py-5 md:-m-6 md:px-8 md:py-6">
				<PinnedPostTabs
					mode={mode}
					onChangeMode={(value) => {
						setMode(value);
						if (value === "list") {
							setForm(INITIAL_FORM);
						}
					}}
				/>

				{mode === "list" ? (
					<PinnedPostListView
						items={pagedPins}
						totalItems={filteredPins.length}
						activeSlotsText={`${Math.min(pins.length, 10)}/10`}
						topCategoryText={topCategoryText}
						lastUpdateText={lastUpdateText}
						search={search}
						category={category}
						sortMode={sortMode}
						currentPage={safeCurrentPage}
						totalPages={totalPages}
						onSearchChange={(value) => {
							setSearch(value);
							setCurrentPage(1);
						}}
						onCategoryChange={(value) => {
							setCategory(value);
							setCurrentPage(1);
						}}
						onSortChange={(value) => {
							setSortMode(value);
							setCurrentPage(1);
						}}
						onPrevPage={() => setCurrentPage((page) => Math.max(1, page - 1))}
						onNextPage={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
						onAddNewPin={() => setMode("create")}
						onEditPin={handleEdit}
						onRequestDelete={setDeleteCandidate}
					/>
				) : (
					<PinnedPostCreateView
						form={form}
						onChange={handleChangeForm}
						onCancel={() => {
							setForm(INITIAL_FORM);
							setMode("list");
						}}
						onSave={handleSavePin}
						isSaving={isSaving}
					/>
				)}
			</div>

			<DeletePinModal
				open={Boolean(deleteCandidate)}
				pinTitle={deleteCandidate?.title}
				isDeleting={isDeleting}
				onCancel={() => {
					if (!isDeleting) {
						setDeleteCandidate(null);
					}
				}}
				onConfirm={handleConfirmDelete}
			/>
		</>
	);
}
