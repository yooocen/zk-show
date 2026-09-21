/**
 * parser.ts — zettelkastenNo 编码解析（纯函数，零依赖）
 *
 * 规则（《卡片编码展示逻辑.md》与《zettelkasten 编码规则-理解.md》）：
 *   - 值按第一个 `/` 切分：前半 = 根（如 `2/21` 的根为 `2`），后半 = 后缀
 *   - 后缀去掉所有 `/` 后按【单字符】切成单元：数字=继续(分支推进)，字母=题外话
 *   - 完整路径 = [根, ...后缀字符]
 *   - 父规范码 = 去掉末单元后的规范码；路径仅 1 单元 → 根，无父
 *   - 规范码 = 根 + (路径长 > 1 时有 `/`) + 后缀字符拼接 → 不同写法归一
 */

export interface ParsedZettel {
  /** 完整路径单元，如 ['1','1','4','a'] */
  path: string[];
  /** 规范码，如 '1/4a'（去重键） */
  canonical: string;
  /** 推断的父规范码；根节点为 null */
  parent: string | null;
}

function canonicalOf(path: string[]): string {
  if (path.length <= 1) return path[0];
  return path[0] + "/" + path.slice(1).join("");
}

/** 由规范码/原始值归一化出可当作 key 的编码；无效输入返回 null */
export function normalizeZettelkastenNo(value: unknown): string | null {
  const p = parseZettelkastenNo(value);
  return p ? p.canonical : null;
}

/**
 * 解析 zettelkastenNo 原始值（YAML 可能给出 number 或 string）。
 * 无效输入（空/null/非字符串非数字）返回 null。
 */
export function parseZettelkastenNo(value: unknown): ParsedZettel | null {
  let s: string;
  if (typeof value === "number") {
    s = String(value);
  } else if (typeof value === "string") {
    s = value;
  } else {
    return null;
  }

  s = s.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  if (s.length === 0) {
    return null;
  }

  const slashIdx = s.indexOf("/");
  let root: string;
  let suffixRaw: string;
  if (slashIdx === -1) {
    root = s;
    suffixRaw = "";
  } else {
    root = s.slice(0, slashIdx);
    suffixRaw = s.slice(slashIdx + 1);
  }

  if (root.length === 0) {
    return null;
  }

  const units = suffixRaw.replace(/\//g, "").split("");
  const path = [root, ...units];
  return {
    path,
    canonical: canonicalOf(path),
    parent: path.length > 1 ? canonicalOf(path.slice(0, -1)) : null,
  };
}

/**
 * 解析 zettelkastenNo 的多个值（逗号 / 空格 / 分号分隔，或 YAML 数组）。
 * 返回按出现顺序去重后的规范码；无有效编码时返回空数组。
 */
export function parseZettelkastenNoList(value: unknown): string[] {
  const parts = Array.isArray(value) ? value : [value];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    if (typeof part === "number") {
      const parsed = parseZettelkastenNo(String(part));
      if (parsed && !seen.has(parsed.canonical)) {
        seen.add(parsed.canonical);
        out.push(parsed.canonical);
      }
      continue;
    }
    if (typeof part !== "string") continue;
    for (const chunk of splitZettelkastenNoValue(part)) {
      if (chunk.endsWith("/")) continue;
      const parsed = parseZettelkastenNo(chunk);
      if (parsed && !seen.has(parsed.canonical)) {
        seen.add(parsed.canonical);
        out.push(parsed.canonical);
      }
    }
  }
  return out;
}

/** 去掉外层引号后按分隔符切分多编码字符串。 */
function splitZettelkastenNoValue(s: string): string[] {
  let t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      t = t.slice(1, -1).trim();
    }
  }
  return t === "" ? [] : t.split(/[,\s;]+/).filter((x) => x !== "");
}
