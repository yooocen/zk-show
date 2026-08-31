export const LAYOUT_METRICS = {
  cardWidth: 240,
  cardHeight: 96,
  canvasPadding: 24,
  horizontalGap: 40,
  verticalGap: 24,
  rowGap: 74,
  branchIndent: 80,
  edgeChannelGap: 26,
  edgeObstacleClearance: 16,
  routingChannelGap: 16,
  hintLength: 50,
  verticalHintLength: 25,
} as const;

function textWidth(text: string, ascii: number, wide: number): number {
  let width = 0;
  for (const character of text) width += character.charCodeAt(0) > 127 ? wide : ascii;
  return width;
}

export function measureCard(code: string, title: string, hasLinks = false): { width: number; height: number } {
  void code;
  void title;
  void hasLinks;
  return { width: LAYOUT_METRICS.cardWidth, height: LAYOUT_METRICS.cardHeight };
}
