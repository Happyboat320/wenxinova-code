export const CORE_CHANGE_START = '<<<CORE_CHANGE>>>';
export const CORE_CHANGE_REASON = '<<<CHANGE_REASON>>>';
export const CORE_CHANGE_END = '<<<END_CORE_CHANGE>>>';

export interface AdaptationSegment {
  text: string;
  reason?: string;
}

const CONTROL_MARKERS = [CORE_CHANGE_START, CORE_CHANGE_REASON, CORE_CHANGE_END];

/**
 * 清除流式响应末尾可能只到达一半的控制符，避免原始阅读态短暂显示协议文本。
 */
function removeTrailingMarkerFragment(text: string): string {
  const markerStart = text.lastIndexOf('<<<');
  if (markerStart < 0) return text;
  const tail = text.slice(markerStart);
  return CONTROL_MARKERS.some(marker => marker.startsWith(tail)) ? text.slice(0, markerStart) : text;
}

/**
 * 将模型返回的核心修改标记解析为正文片段。协议不完整时优先保住正文，隐藏理由和控制符。
 */
export function parseAdaptationMarkup(raw: string): AdaptationSegment[] {
  const segments: AdaptationSegment[] = [];
  let cursor = 0;

  while (cursor < raw.length) {
    const start = raw.indexOf(CORE_CHANGE_START, cursor);
    if (start < 0) {
      const text = removeTrailingMarkerFragment(raw.slice(cursor));
      if (text) segments.push({ text });
      break;
    }

    const plainText = raw.slice(cursor, start);
    if (plainText) segments.push({ text: plainText });

    const changedStart = start + CORE_CHANGE_START.length;
    const reasonStart = raw.indexOf(CORE_CHANGE_REASON, changedStart);
    if (reasonStart < 0) {
      const text = removeTrailingMarkerFragment(raw.slice(changedStart));
      if (text) segments.push({ text });
      break;
    }

    const changedText = raw.slice(changedStart, reasonStart);
    const reasonContentStart = reasonStart + CORE_CHANGE_REASON.length;
    const end = raw.indexOf(CORE_CHANGE_END, reasonContentStart);
    if (end < 0) {
      // 理由已经开始但结束符尚未到达时，正文仍可显示，理由不会混入正文。
      if (changedText) segments.push({ text: changedText });
      break;
    }

    const reason = raw.slice(reasonContentStart, end).trim();
    if (changedText) segments.push({ text: changedText, ...(reason ? { reason } : {}) });
    cursor = end + CORE_CHANGE_END.length;
  }

  return segments;
}

/** 保存、导出、续写以及普通阅读均只使用不含协议符号和修改理由的正文。 */
export function stripAdaptationMarkup(raw: string): string {
  return parseAdaptationMarkup(raw).map(segment => segment.text).join('');
}

