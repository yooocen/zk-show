/** 兼容入口：图模型与焦点投影分别位于独立模块。 */
import { projectFocus, type FocusProjection, type ProjectionCard } from "./focus-projection";
import { TopicGraph, type TopicGraphNode, type ZRecord } from "./topic-graph";

export type { ZRecord } from "./topic-graph";
export { isDigitUnit, isLetterUnit } from "./model-units";
export type { TopicEdgeKind, TopicGraphNode } from "./topic-graph";
export type { FocusProjection, HiddenHint, ProjectionCard, ProjectionLane } from "./focus-projection";

/** 旧名称保留给插件入口和外部调用方；实际实现来自 TopicGraph。 */
export class ThreadIndex extends TopicGraph {}

export type ZNote = TopicGraphNode;
export type Card = ProjectionCard;
export type ViewResult = FocusProjection;

export function computeView(idx: ThreadIndex, currentCode: string): ViewResult | null {
  return projectFocus(idx, currentCode);
}
