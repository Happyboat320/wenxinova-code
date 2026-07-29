import { describe, expect, it } from 'vitest';
import { parseCharacterAnalysis, parseKnowledgeGraph } from './deepseek.js';

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

  it('可从 Markdown 或前后缀文本中提取 JSON 对象，并最多保留六个主要角色', () => {
    const result = parseCharacterAnalysis(`说明文字
\`\`\`json
${JSON.stringify({
  characters: Array.from({ length: 8 }, (_, index) => ({
    name: `角色${index + 1}`,
    description: '主要人物',
    deeds: '推动故事发展',
  })),
})}
\`\`\``);
    expect(result).toHaveLength(6);
    expect(result[5].name).toBe('角色6');
  });
});

describe('知识图谱 JSON 清洗', () => {
  it('限制关系图只保留六个主要人物，并过滤超出人物的关系和事件参与者', () => {
    const result = parseKnowledgeGraph(JSON.stringify({
      timeline: [{
        id: 'event-1',
        time: '开端',
        title: '众人相逢',
        description: '主要人物进入同一事件。',
        characters: ['甲', '乙', '庚'],
      }],
      relationships: {
        nodes: Array.from({ length: 7 }, (_, index) => ({
          id: `character-${index + 1}`,
          name: '甲乙丙丁戊己庚'[index],
          description: '人物说明',
        })),
        edges: [
          { source: 'character-1', target: 'character-2', relation: '相识', description: '同处一事' },
          { source: 'character-1', target: 'character-7', relation: '无效', description: '超出节点范围' },
        ],
      },
    }));

    expect(result.relationships.nodes).toHaveLength(6);
    expect(result.relationships.edges).toHaveLength(1);
    expect(result.timeline[0].characters).toEqual(['甲', '乙']);
  });

  it('拒绝缺少核心结构的知识图谱输出', () => {
    expect(() => parseKnowledgeGraph('{"timeline":[]}')).toThrow('知识图谱 JSON 结构不完整');
  });
});
