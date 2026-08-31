export function isDigitUnit(ch: string): boolean {
  return /^[0-9]$/.test(ch);
}

export function isLetterUnit(ch: string): boolean {
  return /^[a-zA-Z]$/.test(ch);
}
