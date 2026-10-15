import type { ZRecord } from "./model";

/**
 * 计算索引记录集合的稳定指纹。用于判断卡片图谱依赖的数据（路径、编码、
 * 标题、双链）是否真正发生了变化——例如在编辑后立刻撤销时，文件内容回到
 * 原状，指纹不变，从而可以跳过不必要的图谱重建与视口重置。
 *
 * 结果对记录顺序与出链顺序均不敏感：内部先排序再序列化。
 */
export function indexFingerprint(records: ZRecord[]): string {
  const sortable = records
    .map((r) => ({
      path: r.path,
      basename: r.basename,
      no: String(r.no),
      links: (r.links ?? [])
        .map((l) => ({ link: l.link, label: l.label, path: l.path, title: l.title }))
        .sort((a, b) => (a.link < b.link ? -1 : a.link > b.link ? 1 : 0)),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return JSON.stringify(sortable);
}
