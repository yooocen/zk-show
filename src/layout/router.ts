import { edgeSegments, inflateRect, segmentIntersectsRect, segmentsConflict } from "./clearance";
import { LAYOUT_METRICS } from "./geometry";
import type {
  LayoutEdgeSpec,
  LayoutSegment,
  PositionedNode,
  RoutedEdge,
  RoutedLayout,
  SolvedLayout,
} from "./types";

interface Point {
  x: number;
  y: number;
}

export interface RouteOptions {
  forceOuterChannels?: boolean;
}

interface RouteContext {
  nodes: Map<string, PositionedNode>;
  edges: RoutedEdge[];
  options: RouteOptions;
}

function centerX(node: PositionedNode): number {
  return node.x + node.width / 2;
}

function centerY(node: PositionedNode): number {
  return node.y + node.height / 2;
}

function addLine(
  edges: RoutedEdge[],
  spec: LayoutEdgeSpec,
  kind: RoutedEdge["kind"],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  targetId?: string,
  groupId?: string
): void {
  edges.push({
    x1,
    y1,
    x2,
    y2,
    kind,
    dashed: spec.style === "dashed",
    sourceId: spec.sourceId,
    targetId,
    groupId,
  });
}

function addPolyline(edges: RoutedEdge[], spec: LayoutEdgeSpec, points: Point[], groupId = spec.id): void {
  if (points.length < 2) return;
  edges.push({
    x1: points[0].x,
    y1: points[0].y,
    x2: points[points.length - 1].x,
    y2: points[points.length - 1].y,
    kind: "poly",
    dashed: spec.style === "dashed",
    sourceId: spec.sourceId,
    groupId,
    points,
  });
}

function compactPoints(points: Point[]): Point[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
}

function sharesEndpoint(edge: RoutedEdge, ids: Set<string>): boolean {
  return (edge.sourceId !== undefined && ids.has(edge.sourceId)) || (edge.targetId !== undefined && ids.has(edge.targetId));
}

function pathSegments(points: Point[]): LayoutSegment[] {
  const compact = compactPoints(points);
  return compact.slice(1).map((point, index) => ({
    x1: compact[index].x,
    y1: compact[index].y,
    x2: point.x,
    y2: point.y,
  }));
}

function pathIsClear(
  points: Point[],
  sourceId: string,
  targetIds: string[],
  groupId: string,
  context: RouteContext
): boolean {
  const targetSet = new Set([sourceId, ...targetIds]);
  const obstacles = [...context.nodes.values()].filter((node) => !targetSet.has(node.id));
  const segments = pathSegments(points);
  for (const segment of segments) {
    for (const node of obstacles) {
      const rect = inflateRect(
        { x: node.x, y: node.y, width: node.width, height: node.height },
        LAYOUT_METRICS.edgeObstacleClearance
      );
      if (segmentIntersectsRect(segment, rect)) return false;
    }
  }

  const routeIds = new Set([sourceId, ...targetIds]);
  for (const existing of context.edges) {
    if (existing.groupId === groupId || sharesEndpoint(existing, routeIds)) continue;
    if (edgeSegments(existing).some((first) => segments.some((second) => segmentsConflict(first, second)))) return false;
  }
  return true;
}

function candidateChannels(source: PositionedNode, targets: PositionedNode[], context: RouteContext): number[] {
  const obstacleNodes = [...context.nodes.values()].filter(
    (node) => node.id !== source.id && !targets.some((target) => target.id === node.id)
  );
  const padding = LAYOUT_METRICS.edgeObstacleClearance + LAYOUT_METRICS.routingChannelGap;
  const candidates = context.options.forceOuterChannels
    ? [Math.max(...[source.x + source.width, ...obstacleNodes.map((node) => node.x + node.width)]) + padding]
    : [
        centerX(source),
        source.x - padding,
        source.x + source.width + padding,
        ...targets.flatMap((target) => [target.x - padding, target.x + target.width + padding]),
        ...obstacleNodes.flatMap((node) => [node.x - padding, node.x + node.width + padding]),
      ];
  return [...new Set(candidates)].sort((first, second) => {
    const distance = Math.abs(first - centerX(source)) - Math.abs(second - centerX(source));
    return distance || first - second;
  });
}

function targetPortX(target: PositionedNode, channelX: number): number | null {
  if (channelX <= target.x) return target.x;
  if (channelX >= target.x + target.width) return target.x + target.width;
  return null;
}

function routeChain(spec: LayoutEdgeSpec, context: RouteContext): void {
  const source = context.nodes.get(spec.sourceId);
  const target = context.nodes.get(spec.targetIds[0]);
  if (!source || !target) return;
  addLine(context.edges, spec, "link", source.x + source.width, centerY(source), target.x, centerY(target), target.id, spec.id);
}

function routeOrthogonal(spec: LayoutEdgeSpec, context: RouteContext): void {
  const source = context.nodes.get(spec.sourceId);
  const target = context.nodes.get(spec.targetIds[0]);
  if (!source || !target) return;
  const sourceY = spec.direction === "above" ? source.y : source.y + source.height;
  const targetY = centerY(target);
  for (const channelX of candidateChannels(source, [target], context)) {
    const targetX = targetPortX(target, channelX);
    if (targetX === null) continue;
    const points = compactPoints([
      { x: centerX(source), y: sourceY },
      { x: channelX, y: sourceY },
      { x: channelX, y: targetY },
      { x: targetX, y: targetY },
    ]);
    if (!pathIsClear(points, source.id, [target.id], spec.id, context)) continue;
    if (channelX === centerX(source) && targetX === target.x) {
      addLine(context.edges, spec, "vbar", channelX, sourceY, channelX, targetY, target.id, spec.id);
      addLine(context.edges, spec, "link", channelX, targetY, targetX, targetY, target.id, spec.id);
    } else {
      addPolyline(context.edges, spec, points);
    }
    return;
  }
}

function routeSpine(spec: LayoutEdgeSpec, context: RouteContext): void {
  const source = context.nodes.get(spec.sourceId);
  const targets = spec.targetIds.map((id) => context.nodes.get(id)).filter((node): node is PositionedNode => node !== undefined);
  if (!source || targets.length === 0) return;

  const below = spec.direction !== "above";
  const startY = below ? source.y + source.height : source.y;
  let endY = below ? Math.max(...targets.map(centerY)) : Math.min(...targets.map(centerY));
  if (spec.extend) endY += below ? LAYOUT_METRICS.verticalHintLength : -LAYOUT_METRICS.verticalHintLength;

  for (const channelX of candidateChannels(source, targets, context)) {
    const spinePoints = compactPoints([
      { x: centerX(source), y: startY },
      { x: channelX, y: startY },
      { x: channelX, y: endY },
    ]);
    const links = targets.map((target) => {
      const targetX = targetPortX(target, channelX);
      return targetX === null ? null : compactPoints([
        { x: channelX, y: centerY(target) },
        { x: targetX, y: centerY(target) },
      ]);
    });
    if (links.some((link) => link === null) || !pathIsClear(spinePoints, source.id, targets.map((target) => target.id), spec.id, context)) continue;
    if (links.some((link) => !pathIsClear(link!, source.id, targets.map((target) => target.id), spec.id, context))) continue;

    if (channelX === centerX(source) && targets.every((target) => targetPortX(target, channelX) === target.x)) {
      addLine(context.edges, spec, "vbar", channelX, startY, channelX, endY, undefined, spec.id);
      for (const target of targets) addLine(context.edges, spec, "link", channelX, centerY(target), target.x, centerY(target), target.id, spec.id);
    } else {
      addPolyline(context.edges, spec, spinePoints);
      for (const target of targets) {
        const targetX = targetPortX(target, channelX)!;
        addLine(context.edges, spec, "link", channelX, centerY(target), targetX, centerY(target), target.id, spec.id);
      }
    }
    return;
  }
}

function routeHint(spec: LayoutEdgeSpec, context: RouteContext): void {
  const source = context.nodes.get(spec.sourceId);
  if (!source) return;
  const x = centerX(source);
  const y = centerY(source);
  if (spec.placement === "above" || spec.placement === "below") {
    const sign = spec.placement === "above" ? -1 : 1;
    const startY = spec.placement === "above" ? source.y : source.y + source.height;
    const endY = startY + sign * LAYOUT_METRICS.verticalHintLength;
    for (const channelX of candidateChannels(source, [], context)) {
      const points = compactPoints([{ x, y: startY }, { x: channelX, y: startY }, { x: channelX, y: endY }]);
      if (!pathIsClear(points, source.id, [], spec.id, context)) continue;
      if (channelX === x) addLine(context.edges, spec, "vbar", x, startY, x, endY, undefined, spec.id);
      else addPolyline(context.edges, spec, points);
      return;
    }
  } else if (spec.placement === "trailing") {
    const endX = source.x + source.width + LAYOUT_METRICS.hintLength;
    const points = [{ x: source.x + source.width, y }, { x: endX, y }];
    if (pathIsClear(points, source.id, [], spec.id, context)) addLine(context.edges, spec, "cont", points[0].x, y, endX, y, undefined, spec.id);
  }
}

function routeFold(spec: LayoutEdgeSpec, context: RouteContext): void {
  const source = context.nodes.get(spec.sourceId);
  if (!source) return;
  const y = centerY(source);
  const x = source.x - LAYOUT_METRICS.hintLength;
  const direct = [
    { x, y: y + LAYOUT_METRICS.verticalHintLength },
    { x, y },
    { x: source.x, y },
  ];
  if (pathIsClear(direct, source.id, [], spec.id, context)) {
    addPolyline(context.edges, spec, direct);
    return;
  }
  const outerX = Math.min(...[...context.nodes.values()].map((node) => node.x)) -
    LAYOUT_METRICS.hintLength - LAYOUT_METRICS.routingChannelGap;
  addPolyline(context.edges, spec, [
    { x: outerX, y: y + LAYOUT_METRICS.verticalHintLength },
    { x: outerX, y },
    { x: source.x, y },
  ]);
}

/** 将语义边转换为 SVG 可直接消费的线段与折线路径。 */
export function routeEdges(solved: SolvedLayout, options: RouteOptions = {}): RoutedLayout {
  const nodes = new Map(solved.nodes.map((node) => [node.id, node]));
  const edges: RoutedEdge[] = [];
  const context: RouteContext = { nodes, edges, options };
  for (const spec of solved.graph.edges) {
    if (spec.kind === "chain") routeChain(spec, context);
    else if (spec.kind === "orthogonal") routeOrthogonal(spec, context);
    else if (spec.kind === "spine") routeSpine(spec, context);
    else if (spec.kind === "hint") routeHint(spec, context);
    else routeFold(spec, context);
  }
  return { nodes: solved.nodes, edges };
}
