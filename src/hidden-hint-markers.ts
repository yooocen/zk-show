import type { HiddenHint, HiddenHintKind, FocusProjection } from "./focus-projection";
import type { Layout, Edge } from "./renderer";

export interface HiddenHintMarker {
  id: string;
  kind: HiddenHintKind;
  anchorId: string;
  sourceId: string;
  hiddenIds: string[];
  x: number;
  y: number;
  dashed: boolean;
  label: string;
  description: string;
}

const HINT_LABELS: Record<HiddenHintKind, string> = {
  continuation: "连续内容",
  offTopic: "题外分支",
  sourceTail: "来源后续",
  fold: "折叠祖先",
};

function hintDescription(hint: HiddenHint): string {
  const label = HINT_LABELS[hint.kind];
  return `${hint.sourceId} 后面隐藏了 ${hint.hiddenIds.length} 个${label}节点`;
}

function edgePoints(edge: Edge): Array<{ x: number; y: number }> {
  return edge.points ?? [
    { x: edge.x1, y: edge.y1 },
    { x: edge.x2, y: edge.y2 },
  ];
}

function freePoint(edge: Edge, kind: HiddenHintKind): { x: number; y: number } {
  const points = edgePoints(edge);
  return kind === "fold" ? points[0] : points[points.length - 1];
}

function hintEdge(layout: Layout, hint: HiddenHint): Edge | undefined {
  const prefix = `${hint.kind}:${hint.anchorId}:`;
  return layout.edges.find((edge) => edge.groupId?.startsWith(prefix));
}

/**
 * 将隐藏提示的语义锚点映射到真实路由端点。
 *
 * 每条提示对应 compiler 生成的 hint/fold 路由，从该路由的自由端取点。
 */
export function collectHiddenHintMarkers(projection: FocusProjection, layout: Layout): HiddenHintMarker[] {
  const markers: HiddenHintMarker[] = [];
  for (const [index, hint] of projection.hints.entries()) {
    const edge = hintEdge(layout, hint);
    if (!edge) continue;
    const point = freePoint(edge, hint.kind);
    markers.push({
      id: `${hint.kind}:${hint.sourceId}:${hint.anchorId}:${index}`,
      kind: hint.kind,
      anchorId: hint.anchorId,
      sourceId: hint.sourceId,
      hiddenIds: [...hint.hiddenIds],
      x: point.x,
      y: point.y,
      dashed: edge.dashed === true,
      label: HINT_LABELS[hint.kind],
      description: hintDescription(hint),
    });
  }
  return markers;
}
