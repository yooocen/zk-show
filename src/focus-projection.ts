import type { TopicEdgeKind, TopicGraph, TopicGraphNode } from "./topic-graph";
import type { InlineLink } from "./inline-links";

export type ProjectionDirection = "above" | "below" | "same";
export type ProjectionOrientation = "horizontal" | "vertical";
export type ProjectionLaneRole = "source" | "focus" | "expansion" | "previous";

export interface ProjectionCard {
  id: string;
  code: string;
  title: string;
  path: string | null;
  isGhost: boolean;
  isCurrent: boolean;
  links: InlineLink[];
}

export interface ProjectionLane {
  id: string;
  role: ProjectionLaneRole;
  orientation: ProjectionOrientation;
  direction: ProjectionDirection;
  relation: TopicEdgeKind | null;
  anchorId: string | null;
  cards: ProjectionCard[];
  extendSpine?: boolean;
}

export type HiddenHintKind = "continuation" | "offTopic" | "sourceTail" | "fold";
export type HiddenHintPlacement = "above" | "below" | "trailing" | "fold-left";

export interface HiddenHint {
  anchorId: string;
  /** 产生这条语义提示的真实节点；可与视觉锚点不同。 */
  sourceId: string;
  kind: HiddenHintKind;
  placement: HiddenHintPlacement;
  /** 被当前投影省略、点击提示后可查看的节点编码。 */
  hiddenIds: string[];
  extend?: boolean;
}

export interface FocusProjection {
  rootId: string;
  focusId: string;
  baseLane: ProjectionLane;
  branchLane: ProjectionLane | null;
  previousLane: ProjectionLane | null;
  expansionLanes: ProjectionLane[];
  hints: HiddenHint[];
  folded: boolean;
}

function toCard(node: TopicGraphNode, isCurrent: boolean): ProjectionCard {
  return {
    id: node.id,
    code: node.code,
    title: node.title,
    path: node.path,
    isGhost: node.isGhost,
    isCurrent,
    links: [...node.links],
  };
}

function lane(
  id: string,
  role: ProjectionLaneRole,
  orientation: ProjectionOrientation,
  direction: ProjectionDirection,
  relation: TopicEdgeKind | null,
  anchorId: string | null,
  nodes: TopicGraphNode[],
  focusId: string
): ProjectionLane {
  return {
    id,
    role,
    orientation,
    direction,
    relation,
    anchorId,
    cards: nodes.map((node) => toCard(node, node.code === focusId)),
  };
}

function cardCodes(lanes: Array<ProjectionLane | null>): Set<string> {
  const result = new Set<string>();
  for (const current of lanes) {
    for (const card of current?.cards ?? []) result.add(card.code);
  }
  return result;
}

function addHiddenChildHints(graph: TopicGraph, projection: FocusProjection): HiddenHint[] {
  const lanes = [projection.baseLane, projection.branchLane, projection.previousLane, ...projection.expansionLanes];
  const visible = cardCodes(lanes);
  const hints: HiddenHint[] = [];
  const laneByCode = new Map<string, ProjectionLane>();
  for (const current of lanes) {
    if (!current) continue;
    for (const card of current.cards) laneByCode.set(card.code, current);
  }

  for (const current of lanes) {
    for (const card of current?.cards ?? []) {
      const hiddenDigits = graph.digitChildren(card.code).filter((node) => !visible.has(node.code));
      const hiddenLetters = graph.letterChildren(card.code).filter((node) => !visible.has(node.code));
      const owner = laneByCode.get(card.code);

      // 根话题与已显示的首个主行子级保持水平关系。当 baseLane 已显示根卡 + 至少
      // 一个数字子级（例如 [1, 1/1]）时，把根卡未展开的数字子级（1/2、1/3…）
      // 表示为锚定在 baseLane 最末一张卡右侧的 trailing 横线，暗示后面还有同级。
      // baseLane 只有根卡时，trailing 横线锚在根卡本身（题外话直接挂在根节点）。
      const isRootContinuation = card.code === projection.rootId;
      const rootShowsContinuation = isRootContinuation && projection.baseLane.cards.length > 1;
      const isRootOnlyOffTopicSource =
        isRootContinuation &&
        projection.branchLane?.relation === "offTopic" &&
        projection.baseLane.cards.length === 1;
      if (hiddenDigits.length > 0 && (!isRootContinuation || isRootOnlyOffTopicSource || rootShowsContinuation)) {
        const anchorId = rootShowsContinuation
          ? projection.baseLane.cards[projection.baseLane.cards.length - 1].code
          : card.code;
        const placement =
          isRootOnlyOffTopicSource || rootShowsContinuation || owner?.orientation === "vertical" || owner?.role === "previous"
            ? "trailing"
            : "above";
        hints.push({
          anchorId,
          sourceId: card.code,
          kind: "continuation",
          placement,
          hiddenIds: hiddenDigits.map((node) => node.code),
        });
      }

      if (hiddenLetters.length > 0) {
        const isBranchAnchor = projection.branchLane?.relation === "offTopic" && card.code === projection.branchLane.anchorId;
        const hiddenAfterCurrent = isBranchAnchor && hiddenLetters.some((node) => node.siblingOrder > (graph.node(projection.focusId)?.siblingOrder ?? -1));
        hints.push({
          anchorId: card.code,
          sourceId: card.code,
          kind: "offTopic",
          placement: "below",
          hiddenIds: hiddenLetters.map((node) => node.code),
          ...(hiddenAfterCurrent ? { extend: true } : {}),
        });
      }
    }
  }

  if (projection.folded) {
    const anchorId = projection.baseLane.cards[0]?.code ?? projection.branchLane?.anchorId ?? projection.focusId;
    const visible = cardCodes(lanes);
    const hiddenIds = graph.ancestors(anchorId).map((node) => node.code).filter((code) => !visible.has(code));
    if (hiddenIds.length === 0) return hints;
    hints.push({
      anchorId,
      sourceId: anchorId,
      kind: "fold",
      placement: "fold-left",
      hiddenIds,
    });
  }
  return hints;
}

function expansionLanes(graph: TopicGraph, focusId: string, visible: Set<string>): ProjectionLane[] {
  const lanes: ProjectionLane[] = [];
  const digits = graph.digitChildren(focusId).filter((node) => !visible.has(node.code));
  if (digits.length > 0) {
    lanes.push(lane("upper-expansion", "expansion", "horizontal", "above", "continuation", focusId, digits, focusId));
  }
  const letters = graph.letterChildren(focusId).filter((node) => !visible.has(node.code));
  if (letters.length > 0) {
    lanes.push(lane("lower-expansion", "expansion", "vertical", "below", "offTopic", focusId, letters, focusId));
  }
  return lanes;
}

function sourceLane(
  graph: TopicGraph,
  rootId: string,
  parentId: string
): { nodes: TopicGraphNode[]; folded: boolean; truncated: boolean } {
  const rootLine = graph.topicLine(rootId);
  const parentIndex = rootLine.findIndex((node) => node.code === parentId);
  if (parentIndex >= 0) {
    return { nodes: rootLine.slice(0, parentIndex + 1), folded: false, truncated: parentIndex < rootLine.length - 1 };
  }
  const parent = graph.node(parentId);
  return { nodes: parent ? [parent] : [], folded: true, truncated: false };
}

/** 找到当前卡所属题外话主行的起点；字母后的数字继续仍属于这条主行。 */
function offTopicRoot(graph: TopicGraph, focus: TopicGraphNode): TopicGraphNode | null {
  let current: TopicGraphNode | null = focus;
  while (current) {
    if (current.edgeKind === "offTopic") return current;
    current = current.parentId ? graph.node(current.parentId) : null;
  }
  return null;
}

/**
 * 题外话主行的来源，是题外话起点的父卡所在数字同行，并截断在该父卡。
 * 更早的祖先用折线提示，不把它们混入来源行；但根话题例外——
 * 根话题是整个话题的起点，直接加入来源行用直线横线连接，不折叠隐藏。
 */
function offTopicSourceLane(
  graph: TopicGraph,
  anchorId: string
): { nodes: TopicGraphNode[]; folded: boolean; truncated: boolean } {
  const anchor = graph.node(anchorId);
  if (!anchor) return { nodes: [], folded: true, truncated: false };
  if (!anchor.parentId) return { nodes: [anchor], folded: false, truncated: false };

  const topicNodes = graph.digitChildren(anchor.parentId);
  const anchorIndex = topicNodes.findIndex((node) => node.code === anchorId);
  if (anchorIndex < 0) return { nodes: [anchor], folded: true, truncated: false };

  // 父卡若为根话题，把根话题一并纳入来源行并保持平直连接，不画 fold 折线。
  const parent = graph.node(anchor.parentId);
  if (parent !== null && parent.parentId === null) {
    return {
      nodes: [parent, ...topicNodes.slice(0, anchorIndex + 1)],
      folded: false,
      truncated: anchorIndex < topicNodes.length - 1,
    };
  }

  // 来源行只保留题外话起点父卡所在的数字同行（截断在父卡）；
  // 更早的祖先不混入来源行，改由 folded 折线提示表达。
  const hasEarlierAncestors = graph.ancestors(anchorId).length > 0;

  return {
    nodes: topicNodes.slice(0, anchorIndex + 1),
    folded: hasEarlierAncestors,
    truncated: anchorIndex < topicNodes.length - 1,
  };
}

function projectOffTopicLine(graph: TopicGraph, rootId: string, focus: TopicGraphNode, origin: TopicGraphNode): FocusProjection | null {
  const anchorId = origin.parentId;
  if (!anchorId) return null;

  const source = offTopicSourceLane(graph, anchorId);
  const baseLane = lane("source", "source", "horizontal", "same", null, anchorId, source.nodes, focus.code);
  const branchNodes = [origin, ...graph.digitChildren(origin.code)];
  const branchLane = lane("branch", "focus", "horizontal", "below", "offTopic", anchorId, branchNodes, focus.code);
  const allLetters = graph.letterChildren(anchorId);
  const originIndex = allLetters.findIndex((node) => node.code === origin.code);
  const previousNodes = originIndex > 0 ? allLetters.slice(0, originIndex) : [];
  const previousLane =
    previousNodes.length > 0
      ? lane("previous", "previous", "vertical", "below", "offTopic", anchorId, previousNodes, focus.code)
      : null;
  if (previousLane) previousLane.extendSpine = true;

  const projection: FocusProjection = {
    rootId,
    focusId: focus.code,
    baseLane,
    branchLane,
    previousLane,
    expansionLanes: [],
    hints: [],
    folded: source.folded,
  };
  projection.expansionLanes = expansionLanes(graph, focus.code, cardCodes([baseLane, branchLane, previousLane]));
  projection.hints = addHiddenChildHints(graph, projection);
  if (source.truncated) {
    // rootShowsContinuation 已为 baseLane 最末一张卡生成 continuation trailing，
    // 与 sourceTail 同位置同语义，避免重复画两条叠在一起的 cont 横线。
    const hasContinuationTail = projection.hints.some(
      (h) => h.anchorId === baseLane.cards[baseLane.cards.length - 1]?.code && h.kind === "continuation" && h.placement === "trailing"
    );
    if (!hasContinuationTail) {
      const anchor = graph.node(anchorId);
      const line = anchor?.parentId ? graph.digitChildren(anchor.parentId) : [];
      const visible = new Set(baseLane.cards.map((card) => card.code));
      const sourceIndex = line.findIndex((node) => node.code === anchorId);
      const hiddenIds = sourceIndex >= 0 ? line.slice(sourceIndex + 1).map((node) => node.code).filter((code) => !visible.has(code)) : [];
      if (hiddenIds.length > 0) {
        projection.hints.push({ anchorId, sourceId: anchorId, kind: "sourceTail", placement: "trailing", hiddenIds });
      }
    }
  }
  return projection;
}

/** 根据完整编码图生成当前焦点的可见泳道与隐藏提示。 */
export function projectFocus(graph: TopicGraph, focusId: string): FocusProjection | null {
  const focus = graph.node(focusId);
  if (!focus) return null;

  const rootId = graph.rootOf(focusId);
  const rootLine = graph.topicLine(rootId);
  if (rootLine.some((node) => node.code === focusId)) {
    const baseLane: ProjectionLane = lane("base", "focus", "horizontal", "same", null, focusId, rootLine, focusId);
    const projection: FocusProjection = {
      rootId,
      focusId,
      baseLane,
      branchLane: null,
      previousLane: null,
      expansionLanes: [],
      hints: [],
      folded: false,
    };
    projection.expansionLanes = expansionLanes(graph, focusId, cardCodes([baseLane]));
    projection.hints = addHiddenChildHints(graph, projection);
    return projection;
  }

  const origin = offTopicRoot(graph, focus);
  if (origin && (focus.code === origin.code || focus.parentId === origin.code)) {
    return projectOffTopicLine(graph, rootId, focus, origin);
  }

  const parentId = focus.parentId;
  if (!parentId) return null;
  const source = sourceLane(graph, rootId, parentId);
  const baseLane = lane("source", "source", "horizontal", "same", null, parentId, source.nodes, focusId);
  const relation = focus.edgeKind;
  if (!relation) return null;

  const branchNodes = relation === "continuation" ? graph.digitChildren(parentId) : graph.line(focusId);
  const branchLane = lane(
    "branch",
    "focus",
    "horizontal",
    relation === "continuation" ? "above" : "below",
    relation,
    parentId,
    branchNodes,
    focusId
  );

  const allLetters = graph.letterChildren(parentId);
  const focusLetterIndex = allLetters.findIndex((node) => node.code === focusId);
  const previousNodes = relation === "offTopic" && focusLetterIndex > 0 ? allLetters.slice(0, focusLetterIndex) : [];
  const previousLane =
    previousNodes.length > 0
      ? lane("previous", "previous", "vertical", "below", "offTopic", parentId, previousNodes, focusId)
      : null;
  if (previousLane) previousLane.extendSpine = true;

  const projection: FocusProjection = {
    rootId,
    focusId,
    baseLane,
    branchLane,
    previousLane,
    expansionLanes: [],
    hints: [],
    folded: source.folded,
  };
  projection.expansionLanes = expansionLanes(graph, focusId, cardCodes([baseLane, branchLane, previousLane]));
  projection.hints = addHiddenChildHints(graph, projection);
  if (source.truncated) {
    // rootShowsContinuation 已为 baseLane 最末一张卡生成 continuation trailing，
    // 与 sourceTail 同位置同语义，避免重复画两条叠在一起的 cont 横线。
    const hasContinuationTail = projection.hints.some(
      (h) => h.anchorId === parentId && h.kind === "continuation" && h.placement === "trailing"
    );
    if (!hasContinuationTail) {
      const line = graph.topicLine(rootId);
      const visible = new Set(baseLane.cards.map((card) => card.code));
      const sourceIndex = line.findIndex((node) => node.code === parentId);
      const hiddenIds = sourceIndex >= 0 ? line.slice(sourceIndex + 1).map((node) => node.code).filter((code) => !visible.has(code)) : [];
      if (hiddenIds.length > 0) {
        projection.hints.push({ anchorId: parentId, sourceId: parentId, kind: "sourceTail", placement: "trailing", hiddenIds });
      }
    }
  }
  return projection;
}
