// src/features/editor/components/map-elements/MapNodeItem.tsx
import { memo, MouseEvent } from "react";
import { MapNode } from "@/shared/types";

interface MapNodeItemProps {
	node: MapNode;
	isSelected: boolean;
	scale: number;
	onMouseDown: (e: MouseEvent<SVGGElement>, id: number) => void;
}

// Dùng memo để tránh render lại nếu props không đổi
export const MapNodeItem = memo(({ node, isSelected, scale, onMouseDown }: MapNodeItemProps) => {
	return (
		<g
			onMouseDown={(e) => {
				e.stopPropagation();
				onMouseDown(e, node.id);
			}}
			onClick={(e) => {
				e.stopPropagation();
				e.preventDefault();
			}}
			className={`group cursor-pointer ${isSelected ? "cursor-move" : ""}`} // Thêm cursor-move
		>
			{/* Hit Area (Vùng bấm chuột rộng hơn) */}
			<circle cx={node.x} cy={node.y} r="20" fill="transparent" />

			{/* Blocker nền trắng (để che dây bên dưới) */}
			<circle cx={node.x} cy={node.y} r={isSelected ? 10 : 8} fill="white" />

			{/* NODE CHÍNH */}
			<circle
				className="transition-all duration-300 ease-out"
				cx={node.x}
				cy={node.y}
				r={isSelected ? 10 : 8}
				fill="white"
				stroke={isSelected ? "#3b82f6" : "#1e40af"}
				strokeWidth={isSelected ? 4 : 3}
			/>

			{/* Hiệu ứng sóng (Pulse) */}
			{isSelected && <circle cx={node.x} cy={node.y} fill="transparent" r="16" stroke="#60a5fa" strokeWidth="2" className="animate-pulse opacity-60" />}

			{/* Label Text */}
			<text
				className={`pointer-events-none text-[11px] font-bold transition-all duration-300 
                    ${isSelected ? "fill-blue-600 -translate-y-3 text-xs" : "fill-[#1C4D8D] opacity-0 group-hover:opacity-100"}`}
				textAnchor="middle"
				x={node.x}
				y={node.y - 16}
				style={{
					fontSize: `${11 / scale}px`, // Giữ text size ổn định khi zoom
					paintOrder: "stroke",
					stroke: "white",
					strokeWidth: "3px",
					strokeLinecap: "round",
					strokeLinejoin: "round",
				}}
			>
				{node.name}
			</text>
		</g>
	);
});
