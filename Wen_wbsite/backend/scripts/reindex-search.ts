import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { rebuildSearchIndexes } from '../src/modules/search/search.service.js';

async function main() {
  await rebuildSearchIndexes(message => console.log(message));
}

main()
  .catch(error => {
    console.error('重建 Manticore 检索索引失败：', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
