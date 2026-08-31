import { LAYOUT_METRICS } from "./geometry";
import type { LayoutConflict, LayoutRect, LayoutSegment, PositionedNode, RoutedEdge, RoutedLayout } from "./types";

export function inflateRect(rect: LayoutRect, padding: number): LayoutRect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

export function edgeSegments(edge: RoutedEdge): LayoutSegment[] {
  const points = edge.points ?? [
    { x: edge.x1, y: edge.y1 },
    { x: edge.x2, y: edge.y2 },
  ];
  return points.slice(1).map((point, index) => ({
    x1: points[index].x,
    y1: points[index].y,
    x2: point.x,
    y2: point.y,
  }));
}

export function segmentIntersectsRect(segment: LayoutSegment, rect: LayoutRect): boolean {
  const minX = Math.min(segment.x1, segment.x2);
  const maxX = Math.max(segment.x1, segment.x2);
  const minY = Math.min(segment.y1, segment.y2);
  const maxY = Math.max(segment.y1, segment.y2);
  return minX <= rect.x + rect.width && maxX >= rect.x && minY <= rect.y + rect.height && maxY >= rect.y;
}

export function segmentsConflict(first: LayoutSegment, second: LayoutSegment): boolean {
  const firstHorizontal = first.y1 === first.y2;
  const secondHorizontal = second.y1 === second.y2;
  if (firstHorizontal && secondHorizontal) {
    const firstStart = Math.min(first.x1, first.x2);
    const firstEnd = Math.max(first.x1, first.x2);
    const secondStart = Math.min(second.x1, second.x2);
    const secondEnd = Math.max(second.x1, second.x2);
    return first.y1 === second.y1 && firstStart <= secondEnd && secondStart <= firstEnd;
  }
  const firstVertical = first.x1 === first.x2;
  const secondVertical = second.x1 === second.x2;
  if (firstVertical && secondVertical) {
    const firstStart = Math.min(first.y1, first.y2);
    const firstEnd = Math.max(first.y1, first.y2);
    const secondStart = Math.min(second.y1, second.y2);
    const secondEnd = Math.max(second.y1, second.y2);
    return first.x1 === second.x1 && firstStart <= secondEnd && secondStart <= firstEnd;
  }
  const horizontal = firstHorizontal ? first : second;
  const vertical = firstHorizontal ? second : first;
  const horizontalStart = Math.min(horizontal.x1, horizontal.x2);
  const horizontalEnd = Math.max(horizontal.x1, horizontal.x2);
  const verticalStart = Math.min(vertical.y1, vertical.y2);
  const verticalEnd = Math.max(vertical.y1, vertical.y2);
  return horizontalStart <= vertical.x1 && vertical.x1 <= horizontalEnd &&
    verticalStart <= horizontal.y1 && horizontal.y1 <= verticalEnd;
}

function nodeRect(node: PositionedNode): LayoutRect {
  return { x: node.x, y: node.y, width: node.width, height: node.height };
}

function edgeIdentity(edge: RoutedEdge): string {
  return edge.groupId ?? `${edge.sourceId ?? "edge"}->${edge.targetId ?? ""}`;
}

function sharesEndpoint(first: RoutedEdge, second: RoutedEdge): boolean {
  const firstIds = [first.sourceId, first.targetId].filter(Boolean);
  const secondIds = new Set([second.sourceId, second.targetId].filter(Boolean));
  return firstIds.some((id) => secondIds.has(id));
}

export function findLayoutConflicts(layout: RoutedLayout, clearance = LAYOUT_METRICS.edgeObstacleClearance): LayoutConflict[] {
  const conflicts: LayoutConflict[] = [];
  for (let i = 0; i < layout.nodes.length; i++) {
    const first = layout.nodes[i];
    for (let j = i + 1; j < layout.nodes.length; j++) {
      const second = layout.nodes[j];
      if (
        first.x < second.x + second.width &&
        first.x + first.width > second.x &&
        first.y < second.y + second.height &&
        first.y + first.height > second.y
      ) {
        conflicts.push({ kind: "node-node", subjects: [first.id, second.id] });
      }
    }
  }

  for (const edge of layout.edges) {
    for (const node of layout.nodes) {
      if (node.id === edge.sourceId || node.id === edge.targetId) continue;
      const obstacle = inflateRect(nodeRect(node), clearance);
      if (edgeSegments(edge).some((segment) => segmentIntersectsRect(segment, obstacle))) {
        conflicts.push({ kind: "edge-node", subjects: [edgeIdentity(edge), node.id] });
      }
    }
  }

  for (let i = 0; i < layout.edges.length; i++) {
    const first = layout.edges[i];
    for (let j = i + 1; j < layout.edges.length; j++) {
      const second = layout.edges[j];
      if (first.groupId && first.groupId === second.groupId) continue;
      if (sharesEndpoint(first, second)) continue;
      const conflict = edgeSegments(first).some((a) => edgeSegments(second).some((b) => segmentsConflict(a, b)));
      if (conflict) conflicts.push({ kind: "edge-edge", subjects: [edgeIdentity(first), edgeIdentity(second)] });
    }
  }
  return conflicts;
}
