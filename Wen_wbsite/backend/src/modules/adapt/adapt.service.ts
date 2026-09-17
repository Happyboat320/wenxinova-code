import * as deepseek from '../../lib/deepseek.js';

/**
 * 书籍改编与创作入口
 * @param translation 原文或译文内容
 * @param type 类型：adapt(改编), creative(创作), continue(续写), script(剧本杀), custom(自定义)
 * @param prompt 提示词或角色名(剧本杀)
 */
export async function adaptBook(translation: string, type: string, prompt: string) {
  switch (type) {
    case 'continue':
      return deepseek.continueWriting(translation, prompt);
    case 'creative':
      return deepseek.creativeWrite(translation, prompt);
    case 'script':
      return deepseek.generateCharacterScript(translation, prompt); // 此处 prompt 为角色名
    case 'script-tasks':
      return deepseek.generateScriptTasks(translation, prompt);
    case 'custom':
      return deepseek.customPrompt(translation, prompt);
    case 'adapt':
    default:
      return deepseek.adaptBook(translation, prompt);
  }
}

export function adaptBookStream(
  translation: string,
  type: string,
  prompt: string,
  onDelta: (content: string) => void,
  signal?: AbortSignal,
) {
  switch (type) {
    case 'continue':
      return deepseek.continueWritingStream(translation, prompt, onDelta, signal);
    case 'creative':
      return deepseek.creativeWriteStream(translation, prompt, onDelta, signal);
    case 'script':
      return deepseek.generateCharacterScriptStream(translation, prompt, onDelta, signal);
    case 'script-tasks':
      return deepseek.generateScriptTasksStream(translation, prompt, onDelta, signal);
    case 'custom':
      return deepseek.customPromptStream(translation, prompt, onDelta, signal);
    case 'adapt':
    default:
      return deepseek.adaptBookStream(translation, prompt, onDelta, signal);
  }
}

export function analyzeCharacters(originalText: string) {
  return deepseek.analyzeCharactersForCoPlay(originalText);
}
