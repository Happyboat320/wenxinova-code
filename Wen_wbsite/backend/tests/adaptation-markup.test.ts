import { describe, expect, it } from 'vitest';
import {
  CORE_CHANGE_END,
  CORE_CHANGE_REASON,
  CORE_CHANGE_START,
  parseAdaptationMarkup,
  stripAdaptationMarkup,
} from '../../frontend/src/lib/adaptationMarkup';

describe('改编核心修改标记解析', () => {
  it('分离正文、核心修改与理由', () => {
    const raw = `旧雨初歇。${CORE_CHANGE_START}城门忽然关闭${CORE_CHANGE_REASON}增加紧迫冲突${CORE_CHANGE_END}众人回望。`;
    expect(parseAdaptationMarkup(raw)).toEqual([
      { text: '旧雨初歇。' },
      { text: '城门忽然关闭', reason: '增加紧迫冲突' },
      { text: '众人回望。' },
    ]);
    expect(stripAdaptationMarkup(raw)).toBe('旧雨初歇。城门忽然关闭众人回望。');
  });

  it('流式标记未闭合时不泄露控制符和理由', () => {
    expect(stripAdaptationMarkup(`开篇${CORE_CHANGE_START}新情节${CORE_CHANGE_REASON}为了强化`)).toBe('开篇新情节');
    expect(stripAdaptationMarkup('开篇<<<CORE_CH')).toBe('开篇');
  });

  it('缺少理由标记时保留已生成的改编正文', () => {
    expect(stripAdaptationMarkup(`${CORE_CHANGE_START}仍在生成的内容`)).toBe('仍在生成的内容');
  });
});
