import prisma from '../../lib/prisma.js';
import { generateKnowledgeGraph, type KnowledgeGraphData } from '../../lib/deepseek.js';

function deserialize(record: { timelineJson: string; relationshipJson: string; generatedAt: Date }) {
  return {
    timeline: JSON.parse(record.timelineJson) as KnowledgeGraphData['timeline'],
    relationships: JSON.parse(record.relationshipJson) as KnowledgeGraphData['relationships'],
    generatedAt: record.generatedAt,
  };
}

export async function getKnowledgeGraph(bookId: number) {
  const record = await prisma.bookKnowledgeGraph.findUnique({ where: { bookId } });
  return record ? deserialize(record) : null;
}

export async function generateAndCacheKnowledgeGraph(bookId: number, force = false) {
  if (!force) {
    const cached = await getKnowledgeGraph(bookId);
    if (cached) return cached;
  }
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { title: true, author: true, originalText: true },
  });
  if (!book) return null;
  if (!book.originalText?.trim()) throw new Error('当前书籍没有可分析的原文');
  const graph = await generateKnowledgeGraph(book.title, book.author, book.originalText);
  const now = new Date();
  const record = await prisma.bookKnowledgeGraph.upsert({
    where: { bookId },
    create: {
      bookId,
      timelineJson: JSON.stringify(graph.timeline),
      relationshipJson: JSON.stringify(graph.relationships),
      generatedAt: now,
    },
    update: {
      timelineJson: JSON.stringify(graph.timeline),
      relationshipJson: JSON.stringify(graph.relationships),
      generatedAt: now,
    },
  });
  return deserialize(record);
}
