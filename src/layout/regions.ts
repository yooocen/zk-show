import { LAYOUT_METRICS } from "./geometry";
import { OFF_TOPIC_LANE_IDS } from "./types";
import type { LayoutGraph, LayoutLane } from "./types";

export interface LaneRegion {
  id: string;
  laneIds: string[];
  parentId: string | null;
  direction: "above" | "below" | "same";
  order: number;
}

export interface LaneEnvelope {
  regionId: string;
  top: number;
  bottom: number;
}

export interface RegionPoint {
  x: number;
  y: number;
}

function laneIndex(graph: LayoutGraph, laneId: string): number {
  const index = graph.lanes.findIndex((lane) => lane.id === laneId);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function moveLanes(graph: LayoutGraph, positions: Map<string, RegionPoint>, laneIds: string[], dy: number): void {
  const selected = new Set(laneIds);
  for (const node of graph.nodes) {
    if (!selected.has(node.laneId)) continue;
    const point = positions.get(node.id);
    if (point) positions.set(node.id, { x: point.x, y: point.y + dy });
  }
}

function regionForLane(regions: LaneRegion[]): Map<string, LaneRegion> {
  const result = new Map<string, LaneRegion>();
  for (const region of regions) {
    for (const laneId of region.laneIds) result.set(laneId, region);
  }
  return result;
}

function regionDirection(lanes: LayoutLane[]): LaneRegion["direction"] {
  const branch = lanes.find((lane) => lane.id === "branch");
  return branch?.direction ?? lanes[0]?.direction ?? "same";
}

/** Group semantically coupled lanes before calculating vertical envelopes. */
export function buildLaneRegions(graph: LayoutGraph): LaneRegion[] {
  const branch = graph.lanes.find((lane) => lane.id === "branch");
  const offTopicLanes = graph.lanes.filter((lane) => OFF_TOPIC_LANE_IDS.includes(lane.id));
  const mergedOffTopic = branch?.relation === "offTopic" && offTopicLanes.length > 0 ? offTopicLanes.map((lane) => lane.id) : null;
  const grouped = new Set(mergedOffTopic ?? []);
  const regions: LaneRegion[] = [];

  for (const lane of graph.lanes) {
    if (grouped.has(lane.id) && lane.id !== mergedOffTopic?.[0]) continue;
    const laneIds = lane.id === mergedOffTopic?.[0] ? mergedOffTopic : [lane.id];
    regions.push({
      id: laneIds.join("+"),
      laneIds,
      parentId: null,
      direction: regionDirection(laneIds.map((id) => graph.lanes.find((item) => item.id === id)!).filter(Boolean)),
      order: Math.min(...laneIds.map((id) => laneIndex(graph, id))),
    });
  }

  const byLane = regionForLane(regions);
  const byNode = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const region of regions) {
    const primaryLane = graph.lanes.find((lane) => lane.id === region.laneIds[0]);
    const anchorId = primaryLane?.anchorId ?? null;
    const anchor = anchorId ? byNode.get(anchorId) : undefined;
    const parent = anchor ? byLane.get(anchor.laneId) : undefined;
    region.parentId = parent && parent.id !== region.id ? parent.id : null;
  }
  return regions;
}

function envelope(graph: LayoutGraph, region: LaneRegion, positions: Map<string, RegionPoint>): LaneEnvelope {
  const memberLanes = new Set(region.laneIds);
  const nodes = graph.nodes.filter((node) => memberLanes.has(node.laneId));
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const node of nodes) {
    const point = positions.get(node.id);
    if (!point) continue;
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y + node.height);
    for (const edge of graph.edges) {
      if (edge.kind !== "hint" || edge.sourceId !== node.id) continue;
      if (edge.placement === "above") top = Math.min(top, point.y - LAYOUT_METRICS.verticalHintLength);
      if (edge.placement === "below") bottom = Math.max(bottom, point.y + node.height + LAYOUT_METRICS.verticalHintLength);
    }
  }
  if (!Number.isFinite(top)) return { regionId: region.id, top: 0, bottom: 0 };
  return { regionId: region.id, top, bottom };
}

function compareRegions(
  first: LaneRegion,
  second: LaneRegion,
  envelopes: Map<string, LaneEnvelope>
): number {
  const firstEnvelope = envelopes.get(first.id)!;
  const secondEnvelope = envelopes.get(second.id)!;
  return firstEnvelope.top - secondEnvelope.top || first.order - second.order || first.id.localeCompare(second.id);
}

/** Return a stable depth-first order: above children, region, then below children. */
export function orderLaneRegions(
  graph: LayoutGraph,
  regions: LaneRegion[],
  positions: Map<string, RegionPoint>
): string[] {
  const envelopes = new Map(regions.map((region) => [region.id, envelope(graph, region, positions)]));
  const children = new Map<string, LaneRegion[]>();
  for (const region of regions) {
    if (!region.parentId) continue;
    const list = children.get(region.parentId) ?? [];
    list.push(region);
    children.set(region.parentId, list);
  }
  for (const list of children.values()) list.sort((a, b) => compareRegions(a, b, envelopes));

  const roots = regions.filter((region) => !region.parentId).sort((a, b) => compareRegions(a, b, envelopes));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: string[] = [];

  function visit(region: LaneRegion): void {
    if (visited.has(region.id) || visiting.has(region.id)) return;
    visiting.add(region.id);
    const childRegions = children.get(region.id) ?? [];
    for (const child of childRegions) {
      if (child.direction === "above") visit(child);
    }
    visiting.delete(region.id);
    visited.add(region.id);
    ordered.push(region.id);
    for (const child of childRegions) {
      if (child.direction !== "above") visit(child);
    }
  }

  for (const root of roots) visit(root);
  for (const region of regions.slice().sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))) {
    if (!visited.has(region.id)) visit(region);
  }
  return ordered;
}

/** Separate complete semantic regions by the minimum vertical movement. */
export function enforceRegionClearance(
  graph: LayoutGraph,
  regions: LaneRegion[],
  positions: Map<string, RegionPoint>
): void {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const orderedIds = orderLaneRegions(graph, regions, positions);
  let previous: LaneEnvelope | null = null;
  for (const regionId of orderedIds) {
    const region = byId.get(regionId);
    if (!region) continue;
    let current = envelope(graph, region, positions);
    if (previous) {
      const shift = Math.max(0, previous.bottom + LAYOUT_METRICS.rowGap - current.top);
      if (shift > 0) {
        moveLanes(graph, positions, region.laneIds, shift);
        current = envelope(graph, region, positions);
      }
    }
    previous = current;
  }
}
