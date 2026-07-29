import { describe, expect, it } from 'vitest';
import { parseCharacterAnalysis } from './deepseek.js';

describe('角色分析 JSON 清洗', () => {
  it('只接受 characters 对象并限制主要事迹字数', () => {
    const result = parseCharacterAnalysis(JSON.stringify({
      characters: [{
        name: '任氏',
        description: '重情守义的狐女，牵动情节',
        deeds: '她与郑六相知相恋，面对韦崟强逼仍守情义，最终为保全自身信念和所爱之人而走向悲剧结局。',
      }],
    }));
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('重情守义的狐女，牵动情节');
    expect(Array.from(result[0].deeds || '').length).toBeLessThanOrEqual(100);
  });

  it('拒绝非约定结构，避免前端继续解析不稳定文本', () => {
    expect(() => parseCharacterAnalysis('[{"name":"任氏"}]')).toThrow('characters');
  });
});
