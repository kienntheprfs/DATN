import { useState, useRef, MouseEvent, useEffect } from "react";
import { useMapControls } from "../hooks/useMapControl";
import { MapContent } from "./MapContent";
import { MapOverlay } from "./MapOverlay";
import { useEditorStore } from "../stores/editorStores";
import { editorApi } from "@/features/editor/api/editorApi";

export const MapViewport = ({ onCursorMove }: { onCursorMove?: (x: number, y: number) => void }) => {
	// 1. ZUSTAND HOOK
	const { currentMap, nodes, edges, activeTool, selectedId, selectedType, setMap, setNodes, setEdges, addNode, addEdge, selectItem, isEditing, updateNode, deleteNode } = useEditorStore();

	const [isLoading, setIsLoading] = useState(false);
	useEffect(() => {
        const loadMapData = async () => {
            if (!currentMap?.id) return;

            setIsLoading(true);
            try {
                // Gọi song song cả 2 API cho nhanh (Promise.all)
                const [fetchedNodes, fetchedEdges] = await Promise.all([
                    editorApi.getNodes(currentMap.id),
                    editorApi.getEdges(currentMap.id)
                ]);

                console.log("Loaded Nodes:", fetchedNodes);
                console.log("Loaded Edges:", fetchedEdges);

                // Lưu vào Store
                setNodes(fetchedNodes);
                setEdges(fetchedEdges);

            } catch (error) {
                console.error("Lỗi tải dữ liệu map:", error);
                alert("Không thể tải dữ liệu của bản đồ này.");
            } finally {
                setIsLoading(false);
            }
        };

        loadMapData();
    }, [currentMap?.id, setNodes, setEdges]);

	// 2. INTERNAL STATE (Chỉ dùng cho việc vẽ và zoom/pan)
	const { scale, position, isDragging, handlers, reset } = useMapControls(!!currentMap);

	// State tọa độ chuột ảo (đã tính scale/pan)
	const [virtualMouse, setVirtualMouse] = useState({ x: 0, y: 0 });

	// State tạm thời khi đang vẽ Edge (Polyline)
	const [edgeStartNodeId, setEdgeStartNodeId] = useState<number | null>(null);
	const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);

	const [draggingNodeId, setDraggingNodeId] = useState<number | null>(null);

	// Refs
	const svgRef = useRef<SVGSVGElement>(null);
	const groupRef = useRef<SVGGElement>(null);

	// --- HÀM TÍNH TOÁN TỌA ĐỘ CHUẨN ---
	const getMapCoordinates = (e: MouseEvent) => {
		const svg = svgRef.current;
		const group = groupRef.current;
		if (!svg || !group) return { x: 0, y: 0 };

		let point = svg.createSVGPoint();
		point.x = e.clientX;
		point.y = e.clientY;

		const ctm = group.getScreenCTM();
		if (ctm) {
			point = point.matrixTransform(ctm.inverse());
		}
		return { x: point.x, y: point.y };
	};

	// --- EVENT HANDLERS ---

	const handleMouseMove = (e: MouseEvent<SVGSVGElement>) => {
		const coords = getMapCoordinates(e);
		setVirtualMouse(coords);
		onCursorMove?.(coords.x, coords.y);

		// LOGIC KÉO THẢ NODE
		if (draggingNodeId !== null && isEditing) {
			// Cập nhật trực tiếp vào Store (Zustand sẽ làm component re-render cực nhanh)
			updateNode(draggingNodeId, { x: coords.x, y: coords.y });
			return; // Chặn sự kiện Pan bản đồ
		}

		// Chỉ Pan bản đồ khi không kéo node
		if (activeTool === "select" && draggingNodeId === null) {
			handlers.onMouseMove(e);
		}
	};

	const handleMouseUp = async (e: MouseEvent) => {
        // Nếu đang kéo node -> Lưu vị trí mới xuống DB
        if (draggingNodeId !== null) {
            const node = nodes.find(n => n.id === draggingNodeId);
            if (node) {
                try {
                    console.log("Saving node position...", node.id);
                    await editorApi.updateNode(node.id, { x: node.x, y: node.y });
                } catch (err) {
                    console.error("Lỗi save node:", err);
                    alert("Lỗi lưu vị trí!");
                    // Nên có logic revert vị trí cũ nếu lỗi
                }
            }
            setDraggingNodeId(null);
        }
        
        handlers.onMouseUp(e);
    };

	const handleBgClick = async () => {
		if (!currentMap) return;

		// Tool: Add Node
		if (activeTool === "add-node") {
			const tempId = Date.now(); // ID tạm để hiện UI ngay lập tức
            const newNodePayload = {
                map_id: currentMap.id,
                name: "New Node",
                x: virtualMouse.x,
                y: virtualMouse.y,
                type: 'path' as const
            };

            // a. Update UI ngay lập tức (Optimistic Update)
            addNode({ ...newNodePayload, id: tempId } as any);

            try {
                // b. Gọi API lưu
                const savedNode = await editorApi.createNode(newNodePayload);
                
                // c. Update lại Store với ID thật từ DB (Xóa ID tạm, thêm ID thật)
                // (Cách đơn giản nhất: Refetch lại list nodes, hoặc update node tạm thành thật)
                // Ở đây mình ví dụ update lại node đó:
                deleteNode(tempId); // Xóa tạm
                addNode(savedNode); // Thêm thật
            } catch (error) {
                console.error("Lỗi lưu node:", error);
                deleteNode(tempId); // Rollback nếu lỗi
                alert("Không thể tạo node!");
            }
		}

		// Tool: Add Edge (Thêm điểm neo cho đường gấp khúc)
		if (activeTool === "add-edge" && edgeStartNodeId !== null) {
			setDrawingPath((prev) => [...prev, { x: virtualMouse.x, y: virtualMouse.y }]);
			console.log("Added polyline point:", drawingPath);
		}
	};

	const handleNodeClick = async (e: React.MouseEvent, nodeId: number) => {
		e.stopPropagation();
		if (activeTool === "select") {
			if (isEditing && selectedId === nodeId) {
				setDraggingNodeId(nodeId);
			} else {
				selectItem("node", nodeId);
			}
		} else if (activeTool === "add-edge") {
			if (edgeStartNodeId === null) {
				setEdgeStartNodeId(nodeId);
				const startNode = nodes.find((n: { id: number }) => n.id === nodeId);
				if (startNode) {
					setDrawingPath([{ x: startNode.x, y: startNode.y }]);
					setVirtualMouse({ x: startNode.x, y: startNode.y });
				}
			} else {
				if (edgeStartNodeId !== nodeId) {
					// 1. CHUẨN BỊ DỮ LIỆU (Payload)
					// Convert từ {x, y} sang [x, y] để khớp Backend
					console.log("Finalizing edge with path:", drawingPath);
					const formattedPolyline = drawingPath
						.slice(1) // Bỏ điểm đầu (trùng startNode)
						.map((p) => [p.x, p.y]); // Quan trọng: Convert Object -> Array

					const newEdgePayload = {
						start_node_id: edgeStartNodeId,
						end_node_id: nodeId,
						type: "walk",
						bidirectional: true,
						polyline: formattedPolyline,
					};

					try {
						// 2. GỌI API (Lưu xuống DB)
						// Backend sẽ tự tính ID, Weight và trả về object hoàn chỉnh
						const savedEdge = await editorApi.createEdge(newEdgePayload as any);

						// 3. CẬP NHẬT STORE (Dùng dữ liệu thật từ Server)
						addEdge(savedEdge);
					} catch (error) {
						console.error("Lỗi tạo edge:", error);
						alert("Không thể tạo đường đi. Vui lòng thử lại!");
					}

					// 4. RESET STATE (Đưa ra ngoài try/catch để luôn reset dù lỗi hay không)
					setEdgeStartNodeId(null);
					setDrawingPath([]);
				}
			}
		}
	};

	// Helper tạo string cho thẻ <polyline>
	const getPolylineString = (points: { x: number; y: number }[]) => {
		return points.map((p) => `${p.x},${p.y}`).join(" ");
	};

	const cursorStyle = activeTool === "select" ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-crosshair";

	return (
		<main className="flex-1 relative bg-slate-50 overflow-hidden">
			{/* Overlay: Load/Upload Map */}
			{!currentMap && <MapOverlay onUploadSuccess={setMap} />}

			<div className="absolute inset-0 flex items-center justify-center p-0">
				<svg
					ref={svgRef}
					className={`w-full h-full touch-none ${cursorStyle}`}
					viewBox="0 0 800 600"
					onWheel={handlers.onWheel}
					onMouseDown={(e) => {
						if (activeTool === "select") handlers.onMouseDown(e);
					}}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={(e) => {
						setDraggingNodeId(null); // Chuột ra khỏi khung thì ngừng kéo
						handlers.onMouseLeave(e);
					}}
					onClick={handleBgClick}
				>
					{currentMap && (
						<g
							ref={groupRef}
							style={{
								transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
								transformOrigin: "0 0",
								transition: isDragging ? "none" : "transform 0.1s ease-out",
							}}
						>
							<MapContent
								nodes={nodes}
								edges={edges}
								mapImage={currentMap.image_url}
								selectedId={selectedId}
								selectedType={selectedType}
								onSelect={(type, id) => {
									selectItem(type, id);
								}}
								// TRUYỀN HÀM XỬ LÝ RIÊNG CHO NODE
								onNodeMouseDown={(e, id) => handleNodeClick(e, id)}
								scale={scale}
							/>

							{/* --- VISUAL FEEDBACK (GHOST ELEMENTS) --- */}

							{/* 1. Ghost Node */}
							{activeTool === "add-node" && (
								<circle
									cx={virtualMouse.x}
									cy={virtualMouse.y}
									r="8"
									fill="rgba(59, 130, 246, 0.5)"
									stroke="#2563eb"
									strokeWidth="2"
									strokeDasharray="4 4"
									className="pointer-events-none"
								/>
							)}

							{/* 2. Drawing Edge Line */}
							{activeTool === "add-edge" && edgeStartNodeId !== null && drawingPath.length > 0 && (
								<>
									{/* Nét liền (đoạn đã chốt) */}
									<polyline points={getPolylineString(drawingPath)} fill="none" stroke="#2563eb" strokeWidth="2" />
									{/* Nét đứt (đi theo chuột) */}
									<line
										x1={drawingPath[drawingPath.length - 1].x}
										y1={drawingPath[drawingPath.length - 1].y}
										x2={virtualMouse.x}
										y2={virtualMouse.y}
										stroke="#2563eb"
										strokeWidth="2"
										strokeDasharray="5 5"
										className="pointer-events-none"
									/>
									{/* Điểm neo */}
									{drawingPath.map((p, idx) => (
										<circle key={idx} cx={p.x} cy={p.y} r="3" fill="#2563eb" />
									))}
								</>
							)}
						</g>
					)}
				</svg>
			</div>

			{/* --- CONTROLS --- */}
			{currentMap && (
				<>
					<div className="absolute bottom-6 right-6 flex -translate-x-1/2">
						<button
							onClick={reset}
							className="p-2 bg-blue-600 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-colors"
							title="Reset View"
						>
							<span className="material-symbols-outlined">restart_alt</span>
						</button>
					</div>
					<div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none">
						<div className="flex items-center gap-3 px-6 py-2.5 bg-slate-500 text-white font-bold rounded-full shadow-2xl opacity-90">
							<span className="material-symbols-outlined text-xl">mouse</span>
							<span className="text-sm">
								{activeTool === "select"
									? "Kéo để di chuyển • Cuộn để Zoom"
									: activeTool === "add-node"
										? "Click để đặt Node"
										: "Click Node bắt đầu -> Click nền thêm điểm -> Click Node kết thúc"}
							</span>
						</div>
					</div>
				</>
			)}
		</main>
	);
};
