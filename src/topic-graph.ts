import { formatUnit, isDigitUnit, isLetterUnit, lastUnit, unitNumber } from "./model-units";
import { parseZettelkastenNo } from "./parser";
import type { InlineLink } from "./inline-links";

export interface ZRecord {
  path: string;
  basename: string;
  no: unknown;
  links?: InlineLink[];
}

export type TopicEdgeKind = "continuation" | "offTopic";

export interface TopicGraphNode {
  id: string;
  code: string;
  parentId: string | null;
  edgeKind: TopicEdgeKind | null;
  siblingOrder: number;
  path: string | null;
  title: string;
  isGhost: boolean;
  hasChildren: boolean;
  links: InlineLink[];
}

function canonicalFromPath(path: string[]): string {
  if (path.length <= 1) return path[0];
  return path[0] + "/" + path.slice(1).map(formatUnit).join("");
}

function edgeKindFor(path: string[]): TopicEdgeKind | null {
  if (path.length <= 1) return null;
  const last = path[path.length - 1];
  if (isDigitUnit(last)) return "continuation";
  if (isLetterUnit(last)) return "offTopic";
  return null;
}

function compareNodes(a: TopicGraphNode, b: TopicGraphNode, kind: TopicEdgeKind): number {
  const au = lastUnit(a.code);
  const bu = lastUnit(b.code);
  if (kind === "continuation") {
    const delta = unitNumber(au) - unitNumber(bu);
    if (delta !== 0) return delta;
  } else {
    const delta = au.toLowerCase().localeCompare(bu.toLowerCase());
    if (delta !== 0) return delta;
  }
  return a.code.localeCompare(b.code);
}

/**
 * 完整的卡片编码图。该类只关心节点、父子边和同级顺序，不参与焦点投影或坐标布局。
 */
export class TopicGraph {
  private readonly byCode = new Map<string, TopicGraphNode>();
  private readonly childMap = new Map<string, TopicGraphNode[]>();

  constructor(records: ZRecord[]) {
    const actual = new Map<string, { path: string; basename: string; pathUnits: string[]; links: InlineLink[] }>();

    for (const record of records) {
      const parsed = parseZettelkastenNo(record.no);
      if (!parsed || actual.has(parsed.canonical)) continue;
      actual.set(parsed.canonical, {
        path: record.path,
        basename: record.basename,
        pathUnits: parsed.path,
        links: record.links ?? [],
      });
    }

    for (const item of actual.values()) {
      for (let i = 1; i <= item.pathUnits.length; i++) {
        const pathUnits = item.pathUnits.slice(0, i);
        const code = canonicalFromPath(pathUnits);
        if (this.byCode.has(code)) continue;
        const isActual = i === item.pathUnits.length && actual.get(code) === item;
        const parentId = pathUnits.length > 1 ? canonicalFromPath(pathUnits.slice(0, -1)) : null;
        this.byCode.set(code, {
          id: code,
          code,
          parentId,
          edgeKind: edgeKindFor(pathUnits),
          siblingOrder: 0,
          path: isActual ? item.path : null,
          title: isActual ? item.basename : code,
          isGhost: !isActual,
          hasChildren: false,
          links: isActual ? item.links : [],
        });
      }
    }

    for (const [code, item] of actual) {
      const existing = this.byCode.get(code);
      if (!existing) continue;
      this.byCode.set(code, {
        ...existing,
        path: item.path,
        title: item.basename,
        isGhost: false,
        links: item.links,
      });
    }

    for (const node of this.byCode.values()) {
      if (!node.parentId) continue;
      const parent = this.byCode.get(node.parentId);
      if (parent) parent.hasChildren = true;
      const siblings = this.childMap.get(node.parentId) ?? [];
      siblings.push(node);
      this.childMap.set(node.parentId, siblings);
    }

    for (const [parentId, siblings] of this.childMap) {
      const byKind: Record<TopicEdgeKind, TopicGraphNode[]> = {
        continuation: siblings.filter((node) => node.edgeKind === "continuation").sort((a, b) => compareNodes(a, b, "continuation")),
        offTopic: siblings.filter((node) => node.edgeKind === "offTopic").sort((a, b) => compareNodes(a, b, "offTopic")),
      };
      this.childMap.set(parentId, [...byKind.continuation, ...byKind.offTopic]);
      for (const kind of ["continuation", "offTopic"] as const) {
        byKind[kind].forEach((node, index) => {
          node.siblingOrder = index;
        });
      }
    }
  }

  node(code: string): TopicGraphNode | null {
    return this.byCode.get(code) ?? null;
  }

  children(code: string, kind: TopicEdgeKind): TopicGraphNode[] {
    return (this.childMap.get(code) ?? []).filter((node) => node.edgeKind === kind);
  }

  digitChildren(code: string): TopicGraphNode[] {
    return this.children(code, "continuation");
  }

  letterChildren(code: string): TopicGraphNode[] {
    return this.children(code, "offTopic");
  }

  line(code: string): TopicGraphNode[] {
    return [this.node(code), ...this.digitChildren(code)].filter((node): node is TopicGraphNode => node !== null);
  }

  topicLine(code: string): TopicGraphNode[] {
    return this.line(code);
  }

  rootOf(code: string): string {
    const parsed = parseZettelkastenNo(code);
    return parsed?.path[0] ?? code;
  }

  ancestors(code: string): TopicGraphNode[] {
    const result: TopicGraphNode[] = [];
    let current = this.node(code);
    while (current?.parentId) {
      const parent = this.node(current.parentId);
      if (!parent) break;
      result.unshift(parent);
      current = parent;
    }
    return result;
  }

  allNodes(): TopicGraphNode[] {
    return [...this.byCode.values()];
  }
}

export interface RootTopicItem {
  code: string;
  title: string;
  isGhost: boolean;
}

/** 收集所有根话题（无父节点的顶层编码），按数字/字典序排序。 */
export function collectRootTopics(graph: TopicGraph): RootTopicItem[] {
  return graph
    .allNodes()
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
    .map((node) => ({
      code: node.code,
      title: node.isGhost ? node.code : node.title,
      isGhost: node.isGhost,
    }));
}
