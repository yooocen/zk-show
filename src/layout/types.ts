import type {
  ProjectionCard,
  ProjectionDirection,
  ProjectionLaneRole,
  ProjectionOrientation,
} from "../focus-projection";
import type { TopicEdgeKind } from "../topic-graph";

export interface LayoutNode {
  id: string;
  card: ProjectionCard;
  width: number;
  height: number;
  laneId: string;
  order: number;
  role: "normal" | "current" | "source";
}

export interface LayoutLane {
  id: string;
  role: ProjectionLaneRole;
  orientation: ProjectionOrientation;
  direction: ProjectionDirection;
  relation: TopicEdgeKind | null;
  anchorId: string | null;
  nodeIds: string[];
}

export type LayoutConstraintKind = "sameRow" | "above" | "below" | "rightOf" | "ordered" | "gap";

export interface LayoutConstraint {
  kind: LayoutConstraintKind;
  subjects: string[];
  anchor?: string;
  value?: number;
}

export type LayoutEdgeStyle = "solid" | "dashed";
export type LayoutEdgeSpecKind = "chain" | "orthogonal" | "spine" | "hint" | "fold";

export interface LayoutEdgeSpec {
  id: string;
  kind: LayoutEdgeSpecKind;
  sourceId: string;
  targetIds: string[];
  style: LayoutEdgeStyle;
  direction?: ProjectionDirection;
  placement?: "above" | "below" | "trailing" | "fold-left";
}

export interface LayoutGraph {
  focusId: string;
  nodes: LayoutNode[];
  lanes: LayoutLane[];
  edges: LayoutEdgeSpec[];
  constraints: LayoutConstraint[];
}

export interface PositionedNode extends LayoutNode {
  x: number;
  y: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface LayoutConflict {
  kind: "node-node" | "edge-node" | "edge-edge" | "lane-lane";
  subjects: string[];
}

export interface SolvedLayout {
  graph: LayoutGraph;
  nodes: PositionedNode[];
}

export type RoutedEdgeKind = "link" | "vbar" | "cont" | "poly";

export interface RoutedEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: RoutedEdgeKind;
  dashed?: boolean;
  sourceId?: string;
  targetId?: string;
  groupId?: string;
  points?: Array<{ x: number; y: number }>;
}

export interface RoutedLayout {
  nodes: PositionedNode[];
  edges: RoutedEdge[];
}

export interface NormalizedLayout extends RoutedLayout {
  width: number;
  height: number;
}
