import type { FocusProjection, HiddenHint, ProjectionLane } from "../focus-projection";
import { measureCard } from "./geometry";
import type { LayoutConstraint, LayoutEdgeSpec, LayoutGraph, LayoutLane, LayoutNode } from "./types";

function edgeId(kind: string, sourceId: string, targets: string[], index: number): string {
  return `${kind}:${sourceId}:${targets.join(",")}:${index}`;
}

function addLaneEdges(edges: LayoutEdgeSpec[], lane: LayoutLane): void {
  if (lane.orientation !== "horizontal") return;
  for (let i = 1; i < lane.nodeIds.length; i++) {
    const sourceId = lane.nodeIds[i - 1];
    const targetId = lane.nodeIds[i];
    edges.push({
      id: edgeId("chain", sourceId, [targetId], edges.length),
      kind: "chain",
      sourceId,
      targetIds: [targetId],
      style: "solid",
      direction: "same",
    });
  }
}

function addLaneConstraints(constraints: LayoutConstraint[], lane: LayoutLane): void {
  if (lane.nodeIds.length > 1) constraints.push({ kind: "ordered", subjects: lane.nodeIds });
  if (lane.orientation === "horizontal" && lane.nodeIds.length > 1) {
    constraints.push({ kind: "sameRow", subjects: lane.nodeIds });
  }
  if (lane.anchorId && lane.direction !== "same") {
    constraints.push({ kind: lane.direction, subjects: lane.nodeIds, anchor: lane.anchorId });
  }
}

function hintStyle(hint: HiddenHint): "solid" | "dashed" {
  return hint.kind === "offTopic" ? "dashed" : "solid";
}

export function compileLayoutGraph(projection: FocusProjection): LayoutGraph {
  const sourceLanes: ProjectionLane[] = [
    projection.baseLane,
    ...(projection.previousLane ? [projection.previousLane] : []),
    ...(projection.followingLane ? [projection.followingLane] : []),
    ...(projection.branchLane ? [projection.branchLane] : []),
    ...projection.expansionLanes,
  ];
  const nodes: LayoutNode[] = [];
  const nodeIds = new Set<string>();
  const lanes: LayoutLane[] = [];
  const constraints: LayoutConstraint[] = [];
  const edges: LayoutEdgeSpec[] = [];

  for (const sourceLane of sourceLanes) {
    const currentLane: LayoutLane = {
      id: sourceLane.id,
      role: sourceLane.role,
      orientation: sourceLane.orientation,
      direction: sourceLane.direction,
      relation: sourceLane.relation,
      anchorId: sourceLane.anchorId,
      nodeIds: sourceLane.cards.map((card) => card.id),
    };
    lanes.push(currentLane);
    addLaneConstraints(constraints, currentLane);
    addLaneEdges(edges, currentLane);

    sourceLane.cards.forEach((card, order) => {
      if (nodeIds.has(card.id)) return;
      nodeIds.add(card.id);
      const size = measureCard(card.code, card.title, card.links.length > 0);
      nodes.push({
        id: card.id,
        card,
        width: size.width,
        height: size.height,
        laneId: sourceLane.id,
        order,
        role: card.isCurrent ? "current" : sourceLane.role === "source" ? "source" : "normal",
      });
    });
  }

  if (projection.branchLane?.anchorId && projection.branchLane.cards.length > 0) {
    if (projection.branchLane.relation === "continuation") {
      edges.push({
        id: edgeId("branch", projection.branchLane.anchorId, [projection.branchLane.cards[0].id], edges.length),
        kind: "orthogonal",
        sourceId: projection.branchLane.anchorId,
        targetIds: [projection.branchLane.cards[0].id],
        style: "solid",
        direction: "above",
      });
    } else {
      const targets = [
        ...(projection.previousLane?.cards.map((card) => card.id) ?? []),
        projection.branchLane.cards[0].id,
        ...(projection.followingLane?.cards.map((card) => card.id) ?? []),
      ];
      const extend = projection.hints.some(
        (hint) => hint.anchorId === projection.branchLane?.anchorId && hint.kind === "offTopic" && hint.extend
      );
      edges.push({
        id: edgeId("branch-spine", projection.branchLane.anchorId, targets, edges.length),
        kind: "spine",
        sourceId: projection.branchLane.anchorId,
        targetIds: targets,
        style: "dashed",
        direction: "below",
        extend,
      });
      constraints.push({ kind: "rightOf", subjects: targets, anchor: projection.branchLane.anchorId });
    }
  }

  // 先路由 trailing/above 等 hint 提示线，再路由 expansion spine。
  // 否则 expansion spine 可能先占位，挡住 baseLane 最末一张卡的 trailing 横线
  // （例如点击 1/11 时 1/1 右侧的"还有 1/2 等"暗示横线会被 1/11→1/11a 的 spine 竖直段穿过）。
  for (const hint of projection.hints) {
    const mergedIntoSpine =
      hint.kind === "offTopic" &&
      hint.extend === true &&
      projection.branchLane?.relation === "offTopic" &&
      projection.branchLane.anchorId === hint.anchorId;
    if (mergedIntoSpine) continue;
    edges.push({
      id: edgeId(hint.kind, hint.anchorId, [], edges.length),
      kind: hint.kind === "fold" ? "fold" : "hint",
      sourceId: hint.anchorId,
      targetIds: [],
      style: hintStyle(hint),
      placement: hint.placement,
      extend: hint.extend,
    });
  }

  for (const expansion of projection.expansionLanes) {
    if (!expansion.anchorId || expansion.cards.length === 0) continue;
    if (expansion.orientation === "vertical") {
      edges.push({
        id: edgeId("expansion-spine", expansion.anchorId, expansion.cards.map((card) => card.id), edges.length),
        kind: "spine",
        sourceId: expansion.anchorId,
        targetIds: expansion.cards.map((card) => card.id),
        style: expansion.relation === "offTopic" ? "dashed" : "solid",
        direction: expansion.direction,
      });
      constraints.push({ kind: "rightOf", subjects: expansion.cards.map((card) => card.id), anchor: expansion.anchorId });
    } else {
      edges.push({
        id: edgeId("expansion", expansion.anchorId, [expansion.cards[0].id], edges.length),
        kind: "orthogonal",
        sourceId: expansion.anchorId,
        targetIds: [expansion.cards[0].id],
        style: expansion.relation === "offTopic" ? "dashed" : "solid",
        direction: expansion.direction,
      });
    }
  }

  return { focusId: projection.focusId, nodes, lanes, edges, constraints };
}
