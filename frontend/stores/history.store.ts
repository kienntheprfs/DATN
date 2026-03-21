import { create } from "zustand";

export const useHistoryStore = create((set) => {
	history: [
		{ title: "Genesis", url: "#" },
		{ title: "Explorer", url: "#" },
	];
});
