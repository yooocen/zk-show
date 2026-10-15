import type { ZRecord } from "../../src/topic-graph";

/**
 * 1/14 下有 a、b、c 三张题外话卡：
 * - 1/14b 同时有后续数字（1/14b1）和自己的题外话（1/14ba）
 * - 1/14c 同时有后续数字（1/14c1）和自己的题外话（1/14ca）
 * - 1/14a1 是题外话主行上的数字继续卡
 * - 1/14a 有自己的题外话（1/14aa），用来验证焦点行里的卡也要为提示线留空间
 * 用来验证"兄弟卡自己的提示线也要显示"。
 */
export const OFFTOPIC_SIBLING_RECORDS: ZRecord[] = [
  { path: "数学.md", basename: "数学", no: "1" },
  { path: "线性代数.md", basename: "线性代数", no: "1/1" },
  { path: "第3章 向量空间与子空间.md", basename: "第3章 向量空间与子空间", no: "1/14" },
  { path: "R^n之外的三个向量空间.md", basename: "R^n 之外的三个向量空间", no: "1/14a" },
  { path: "子空间的定义.md", basename: "子空间的定义", no: "1/14a1" },
  { path: "几何直觉补充（a）.md", basename: "几何直觉补充（a）", no: "1/14aa" },
  { path: "子空间与基的关系.md", basename: "子空间与基的关系", no: "1/14b" },
  { path: "基的判定.md", basename: "基的判定", no: "1/14b1" },
  { path: "几何直觉补充.md", basename: "几何直觉补充", no: "1/14ba" },
  { path: "维数与秩的几何意义.md", basename: "维数与秩的几何意义", no: "1/14c" },
  { path: "秩的等价刻画.md", basename: "秩的等价刻画", no: "1/14c1" },
  { path: "几何直觉补充二.md", basename: "几何直觉补充二", no: "1/14ca" },
];
