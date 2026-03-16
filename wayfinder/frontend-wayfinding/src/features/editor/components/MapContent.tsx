import { MapNode, MapEdge } from "@/shared/types";
// Import các sub-components vừa tạo
import { MapNodeItem } from "./map-elements/MapNodeItem"; 
import { MapEdgeItem } from "./map-elements/MapEdgeItem";

interface MapContentProps {
    nodes: MapNode[];
    edges: MapEdge[];
    mapImage: string;
    selectedId: number | null;
    selectedType: "node" | "edge" | null;
    onSelect: (type: "node" | "edge", id: number) => void;
	onNodeMouseDown: (e: React.MouseEvent, id: number) => void;
    scale: number;
}

export const MapContent = ({ nodes, edges, mapImage, selectedId, selectedType, onSelect, onNodeMouseDown, scale }: MapContentProps) => {
    return (
        <>
            {/* BACKGROUND IMAGE */}
            <image
                href={mapImage}
                x="0" y="0" width="800" height="600"
                preserveAspectRatio="xMidYMid meet"
                className="opacity-80 transition-all pointer-events-none" // pointer-events-none để không chặn click nền
            />

            {/* LAYER EDGES */}
            {edges.map((edge) => (
                <MapEdgeItem
                    key={edge.id}
                    edge={edge}
                    nodes={nodes}
                    isSelected={selectedType === "edge" && selectedId === edge.id}
                    onSelect={(edgeId) => onSelect("edge", edgeId)}
                />
            ))}

            {/* LAYER NODES (Vẽ sau để đè lên Edge) */}
            {nodes.map((node) => (
                <MapNodeItem
                    key={node.id}
                    node={node}
                    scale={scale}
                    isSelected={selectedType === "node" && selectedId === node.id}
                    onMouseDown={onNodeMouseDown}
                />
            ))}
        </>
    );
};