import { LAYOUT_METRICS } from "./geometry";
import type { NormalizedLayout, RoutedEdge, RoutedLayout } from "./types";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function include(bounds: Bounds, x: number, y: number): void {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function shiftEdge(edge: RoutedEdge, dx: number, dy: number): RoutedEdge {
  return {
    ...edge,
    x1: edge.x1 + dx,
    y1: edge.y1 + dy,
    x2: edge.x2 + dx,
    y2: edge.y2 + dy,
    ...(edge.points ? { points: edge.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) } : {}),
  };
}

/** 把节点和所有线段的联合包围盒平移到画布内，并生成最终尺寸。 */
export function normalizeLayout(layout: RoutedLayout): NormalizedLayout {
  const bounds: Bounds = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };

  for (const node of layout.nodes) {
    include(bounds, node.x, node.y);
    include(bounds, node.x + node.width, node.y + node.height);
  }
  for (const edge of layout.edges) {
    const points = edge.points ?? [
      { x: edge.x1, y: edge.y1 },
      { x: edge.x2, y: edge.y2 },
    ];
    for (const point of points) include(bounds, point.x, point.y);
  }

  if (!Number.isFinite(bounds.minX)) {
    const size = LAYOUT_METRICS.canvasPadding * 2;
    return { nodes: [], edges: [], width: size, height: size };
  }

  const dx = LAYOUT_METRICS.canvasPadding - bounds.minX;
  const dy = LAYOUT_METRICS.canvasPadding - bounds.minY;
  const width = Math.ceil(bounds.maxX - bounds.minX + LAYOUT_METRICS.canvasPadding * 2);
  const height = Math.ceil(bounds.maxY - bounds.minY + LAYOUT_METRICS.canvasPadding * 2);

  return {
    nodes: layout.nodes.map((node) => ({ ...node, x: node.x + dx, y: node.y + dy })),
    edges: layout.edges.map((edge) => shiftEdge(edge, dx, dy)),
    width,
    height,
  };
}
