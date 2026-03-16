// src/features/editor/components/map-elements/MapEdgeItem.tsx
import { memo, useMemo } from "react";
import { MapEdge, MapNode } from "@/shared/types";

interface MapEdgeItemProps {
	edge: MapEdge;
	nodes: MapNode[]; // Cần nodes để tính tọa độ
	isSelected: boolean;
	onSelect: (id: number) => void;
}

export const MapEdgeItem = memo(({ edge, nodes, isSelected, onSelect }: MapEdgeItemProps) => {
	// Tính toán path chỉ khi data thay đổi
	const pathData = useMemo(() => {
		const startNode = nodes.find((n) => n.id === edge.start_node_id);
		const endNode = nodes.find((n) => n.id === edge.end_node_id);
		if (!startNode || !endNode) return "";

		// Bắt đầu từ Node đầu
		let d = `M ${startNode.x} ${startNode.y}`;

		// Duyệt qua mảng polyline [[x,y], [x,y]]
		if (edge.polyline && Array.isArray(edge.polyline)) {
			edge.polyline.forEach((point) => {
				// Kiểm tra point phải là mảng có 2 phần tử [x, y]
				if (Array.isArray(point) && point.length >= 2) {
					d += ` L ${point[0]} ${point[1]}`;
				}
			});
		}

		// Kết thúc tại Node cuối
		d += ` L ${endNode.x} ${endNode.y}`;
		return d;
	}, [edge, nodes]);

	if (!pathData) return null;

	return (
		<g
			className="cursor-pointer group"
			onClick={(e) => {
                e.preventDefault();
				e.stopPropagation();
                console.log("Edge clicked:", edge.id);
				onSelect(edge.id);
			}}
		>
			{/* Hit Area (Vùng bấm chuột rộng 20px) */}
			<path
				d={pathData}
				fill="none"
				stroke="transparent"
				strokeWidth="20"
				strokeLinecap="round"
				strokeLinejoin="round"
				style={{ pointerEvents: "stroke", cursor: "pointer" }}
			/>

			{/* Halo trắng (Viền nền tách khỏi bản đồ) */}
			<path
				d={pathData}
				fill="none"
				stroke="white"
				strokeWidth={isSelected ? 8 : 6}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="opacity-90"
			/>

			{/* Đường chính */}
			<path
				d={pathData}
				fill="none"
				stroke={isSelected ? "#3b82f6" : "#1C4D8D"}
				strokeWidth={isSelected ? 4 : 3}
				strokeDasharray={isSelected ? "0" : "6 4"}
				strokeLinecap="round"
				strokeLinejoin="round"
				className="transition-colors duration-200"
			/>
		</g>
	);
});
