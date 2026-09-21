import type { TopicGraph } from "./topic-graph";

export interface ZkNoSwitchOption {
  rootCode: string;
  rootTitle: string;
  /** 该文件在此根话题下对应的 zkNo（首个）。 */
  zkNo: string;
}

/** 按编码出现顺序去重根话题，生成下拉选项。 */
export function deriveZkNoSwitchOptions(codes: string[], graph: TopicGraph): ZkNoSwitchOption[] {
  const seen = new Set<string>();
  const out: ZkNoSwitchOption[] = [];
  for (const code of codes) {
    const root = graph.rootOf(code);
    if (seen.has(root)) continue;
    seen.add(root);
    const rootNode = graph.node(root);
    out.push({
      rootCode: root,
      rootTitle: rootNode && !rootNode.isGhost ? rootNode.title : root,
      zkNo: code,
    });
  }
  return out;
}
