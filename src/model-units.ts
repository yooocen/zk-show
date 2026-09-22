export function isDigitUnit(ch: string): boolean {
  return /^[0-9]$/.test(ch) || /^\([1-9][0-9]+\)$/.test(ch);
}

export function isLetterUnit(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch);
}

/** 多位数字单元加括号，如 "10" → "(10)"；其他原样返回。 */
export function formatUnit(unit: string): string {
  return /^[1-9][0-9]+$/.test(unit) ? `(${unit})` : unit;
}

/** 解析单元数值："(10)" → 10，"9" → 9。 */
export function unitNumber(unit: string): number {
  const m = /^\(([1-9][0-9]+)\)$/.exec(unit);
  return m ? Number(m[1]) : Number(unit);
}

/** 从规范码词法取末尾单元；无 "/" 时返回整串（根本身即一个单元）。 */
export function lastUnit(code: string): string {
  const slash = code.lastIndexOf("/");
  if (slash < 0) return code;
  const tail = code.slice(slash + 1);
  if (tail.endsWith(")")) {
    const open = tail.lastIndexOf("(");
    if (open >= 0) return tail.slice(open);
  }
  return tail[tail.length - 1];
}
