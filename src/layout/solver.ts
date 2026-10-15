import { LAYOUT_METRICS } from "./geometry";
import { buildLaneRegions, enforceRegionClearance } from "./regions";
import type { LayoutGraph, LayoutLane, LayoutNode, PositionedNode, SolvedLayout } from "./types";

type Point = { x: number; y: number };

function nodesForLane(graph: LayoutGraph, lane: LayoutLane): LayoutNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return lane.nodeIds.map((id) => byId.get(id)).filter((node): node is LayoutNode => node !== undefined);
}

function placeHorizontal(nodes: LayoutNode[], startX: number, y: number, positions: Map<string, Point>): void {
  let x = startX;
  for (const node of nodes) {
    positions.set(node.id, { x, y });
    x += node.width + LAYOUT_METRICS.horizontalGap;
  }
}

function placeVertical(
  nodes: LayoutNode[],
  x: number,
  startY: number,
  positions: Map<string, Point>,
  extraGapAfter?: (node: LayoutNode) => number
): number {
  let y = startY;
  for (const node of nodes) {
    positions.set(node.id, { x, y });
    y += node.height + LAYOUT_METRICS.verticalGap + (extraGapAfter ? extraGapAfter(node) : 0);
  }
  return y;
}

/**
 * 竖列卡片自己的"向下提示"（题外话分支）需要预留的竖直空间。
 * 兄弟列默认间距 verticalGap(24) 比提示线长度 verticalHintLength(25) 还小，
 * 而且直线路由还需要额外的 edgeObstacleClearance 净空；不预留的话
 * 中间兄弟的虚线提示只能绕到旁边，看起来像挂错了地方。
 */
function hintSpaceAfter(graph: LayoutGraph, node: LayoutNode): number {
  const hasBelowHint = graph.edges.some(
    (edge) => edge.kind === "hint" && edge.placement === "below" && edge.sourceId === node.id
  );
  return hasBelowHint ? LAYOUT_METRICS.verticalHintLength : 0;
}

function centerX(node: LayoutNode, point: Point): number {
  return point.x + node.width / 2;
}

function intersects(a: PositionedNode, b: PositionedNode): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function overlapsHorizontally(a: PositionedNode, b: PositionedNode): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x;
}

function verticalClearance(a: PositionedNode, b: PositionedNode): number {
  return Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height);
}

function laneGroup(graph: LayoutGraph, laneId: string): string[] {
  const offTopicLaneIds = ["previous", "branch", "following"];
  const branch = graph.lanes.find((lane) => lane.id === "branch");
  if (branch?.relation === "offTopic" && offTopicLaneIds.includes(laneId)) {
    return graph.lanes.filter((lane) => offTopicLaneIds.includes(lane.id)).map((lane) => lane.id);
  }
  return [laneId];
}

function sharesLaneGroup(graph: LayoutGraph, first: string, second: string): boolean {
  return laneGroup(graph, first).includes(second) || laneGroup(graph, second).includes(first);
}

function moveLanes(graph: LayoutGraph, positions: Map<string, Point>, laneIds: string[], dx: number, dy: number): void {
  const selected = new Set(laneIds);
  for (const node of graph.nodes) {
    if (!selected.has(node.laneId)) continue;
    const point = positions.get(node.id);
    if (point) positions.set(node.id, { x: point.x + dx, y: point.y + dy });
  }
}

function resolveCollisions(graph: LayoutGraph, positions: Map<string, Point>): void {
  const laneOrder = new Map(graph.lanes.map((lane, index) => [lane.id, index]));
  const laneById = new Map(graph.lanes.map((lane) => [lane.id, lane]));
  const regionByLane = new Map<string, string[]>();
  for (const region of buildLaneRegions(graph)) {
    for (const laneId of region.laneIds) regionByLane.set(laneId, region.laneIds);
  }

  for (let pass = 0; pass < 100; pass++) {
    const placed = graph.nodes.map((node) => ({ ...node, ...positions.get(node.id)! }));
    let collision: [PositionedNode, PositionedNode] | null = null;
    for (let i = 0; i < placed.length && !collision; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        if (placed[i].laneId === placed[j].laneId || sharesLaneGroup(graph, placed[i].laneId, placed[j].laneId)) continue;
        const hasCollision = intersects(placed[i], placed[j]) ||
          (overlapsHorizontally(placed[i], placed[j]) && verticalClearance(placed[i], placed[j]) < LAYOUT_METRICS.rowGap);
        if (hasCollision) {
          collision = [placed[i], placed[j]];
          break;
        }
      }
    }
    if (!collision) return;

    const [first, second] = collision;
    const firstOrder = laneOrder.get(first.laneId) ?? 0;
    const secondOrder = laneOrder.get(second.laneId) ?? 0;
    const movable = firstOrder > secondOrder ? first : second;
    const fixed = movable === first ? second : first;
    const lane = laneById.get(movable.laneId);
    if (!lane) return;
    const movableGroup = regionByLane.get(movable.laneId) ?? laneGroup(graph, lane.id);

    if (lane.orientation === "vertical") {
      const shift = fixed.x + fixed.width + LAYOUT_METRICS.horizontalGap - movable.x;
      moveLanes(graph, positions, movableGroup, Math.max(shift, LAYOUT_METRICS.horizontalGap), 0);
    } else if (lane.direction === "above") {
      const shift = movable.y + movable.height - fixed.y + LAYOUT_METRICS.verticalGap;
      moveLanes(graph, positions, movableGroup, 0, -Math.max(shift, LAYOUT_METRICS.verticalGap));
    } else if (lane.direction === "below") {
      const shift = fixed.y + fixed.height - movable.y + LAYOUT_METRICS.verticalGap;
      moveLanes(graph, positions, movableGroup, 0, Math.max(shift, LAYOUT_METRICS.verticalGap));
    } else {
      const shift = fixed.x + fixed.width + LAYOUT_METRICS.horizontalGap - movable.x;
      moveLanes(graph, positions, movableGroup, Math.max(shift, LAYOUT_METRICS.horizontalGap), 0);
    }
  }
}

/** 根据 LayoutGraph 的泳道与方向约束生成确定性节点坐标。 */
export function solveLayout(graph: LayoutGraph): SolvedLayout {
  const positions = new Map<string, Point>();
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const baseLane = graph.lanes[0];
  if (!baseLane) return { graph, nodes: [] };

  placeHorizontal(nodesForLane(graph, baseLane), 0, 0, positions);

  const branchLane = graph.lanes.find((lane) => lane.id === "branch");
  const previousLane = graph.lanes.find((lane) => lane.id === "previous");
  const followingLane = graph.lanes.find((lane) => lane.id === "following");
  if (branchLane?.anchorId) {
    const anchor = byId.get(branchLane.anchorId);
    const anchorPoint = positions.get(branchLane.anchorId);
    if (anchor && anchorPoint) {
      const branchNodes = nodesForLane(graph, branchLane);
      if (branchLane.direction === "above") {
        const maxHeight = Math.max(...branchNodes.map((node) => node.height), LAYOUT_METRICS.cardHeight);
        // branchLane 起始 x 用 anchor 右边缘 + horizontalGap，让分支卡不再压在
        // anchor 正上方；orthogonal 折线的水平段长度 = anchor.width/2 + horizontalGap，
        // 随 anchor 卡宽动态变化，而不是固定 edgeChannelGap。
        placeHorizontal(
          branchNodes,
          anchorPoint.x + anchor.width + LAYOUT_METRICS.horizontalGap,
          anchorPoint.y - LAYOUT_METRICS.rowGap - maxHeight,
          positions
        );
      } else {
        const firstX = anchorPoint.x + anchor.width + LAYOUT_METRICS.horizontalGap;
        const stackTop = anchorPoint.y + anchor.height + LAYOUT_METRICS.rowGap;
        const previousNodes = previousLane ? nodesForLane(graph, previousLane) : [];
        const reserveHint = (node: LayoutNode) => hintSpaceAfter(graph, node);
        const focusRowTop = placeVertical(previousNodes, firstX, stackTop, positions, reserveHint);
        placeHorizontal(branchNodes, firstX, focusRowTop, positions);
        const focusRowHeight = Math.max(...branchNodes.map((node) => node.height), 0);
        // 焦点行里除了焦点卡还有它的数字继续卡，它们自己的题外话提示同样挂在下方，也要留空间。
        const focusRowHintSpace = Math.max(...branchNodes.map((node) => hintSpaceAfter(graph, node)), 0);
        // 焦点之后的题外话兄弟紧接焦点行下方，保持同一列与紧凑 verticalGap，并为焦点行的向下提示让位。
        const followingNodes = followingLane ? nodesForLane(graph, followingLane) : [];
        placeVertical(
          followingNodes,
          firstX,
          focusRowTop + focusRowHeight + focusRowHintSpace + LAYOUT_METRICS.verticalGap,
          positions,
          reserveHint
        );
      }
    }
  }

  for (const lane of graph.lanes.filter((item) => item.role === "expansion")) {
    if (!lane.anchorId) continue;
    const anchor = byId.get(lane.anchorId);
    const anchorPoint = positions.get(lane.anchorId);
    if (!anchor || !anchorPoint) continue;
    const laneNodes = nodesForLane(graph, lane);
    if (lane.orientation === "horizontal") {
      const maxHeight = Math.max(...laneNodes.map((node) => node.height), LAYOUT_METRICS.cardHeight);
      placeHorizontal(
        laneNodes,
        anchorPoint.x + anchor.width + LAYOUT_METRICS.horizontalGap,
        anchorPoint.y - LAYOUT_METRICS.rowGap - maxHeight,
        positions
      );
    } else {
      let x = anchorPoint.x + anchor.width + LAYOUT_METRICS.horizontalGap;
      const maxWidth = Math.max(...laneNodes.map((node) => node.width), 0);
      const stackHeight = laneNodes.reduce((height, node) => height + node.height + LAYOUT_METRICS.verticalGap, 0) - LAYOUT_METRICS.verticalGap;
      const targetTop = anchorPoint.y + anchor.height + LAYOUT_METRICS.rowGap;
      const targetBottom = targetTop + stackHeight;
      for (const edge of graph.edges) {
        if (edge.kind !== "hint" || edge.placement !== "below") continue;
        const blocker = byId.get(edge.sourceId);
        const blockerPoint = positions.get(edge.sourceId);
        if (!blocker || !blockerPoint) continue;
        const hintTop = blockerPoint.y + blocker.height;
        const hintBottom = hintTop + LAYOUT_METRICS.verticalHintLength;
        const yOverlaps = targetTop < hintBottom && targetBottom > hintTop;
        const xOverlaps = x < blockerPoint.x + blocker.width + LAYOUT_METRICS.horizontalGap && x + maxWidth > blockerPoint.x;
        if (yOverlaps && xOverlaps) x = blockerPoint.x + blocker.width + LAYOUT_METRICS.horizontalGap;
      }
      placeVertical(
        laneNodes,
        x,
        targetTop,
        positions
      );
    }
  }

  const regions = buildLaneRegions(graph);
  enforceRegionClearance(graph, regions, positions);
  resolveCollisions(graph, positions);
  return {
    graph,
    nodes: graph.nodes.map((node) => ({ ...node, ...(positions.get(node.id) ?? { x: 0, y: 0 }) })),
  };
}
