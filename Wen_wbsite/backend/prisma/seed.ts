import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('开始播种数据...');

  // 清空旧的书籍和角色数据
  await prisma.annotation.deleteMany();
  await prisma.character.deleteMany();
  await prisma.book.deleteMany();
  console.log('已清空旧数据');

  // 根据 Excel "小说目录信息.xlsx" 导入前三篇小说数据
  // Excel 列：序号、篇名、年代、作者、注释数目、类别、主题、人物、关键词、梗概
  const books = [
    {
      // 序号 1: 任氏传
      title: '任氏传',
      author: '沈既济',
      dynasty: '唐',
      category: '传奇',
      theme: '爱情（人妖恋）',
      mainCharacters: '任氏；郑六；韦崟',
      keywords: '狐仙、爱情、反抗、报恩',
      annotationCount: 171,
      description: '晋人已有关于狐仙的记载，但比较完整地描述狐仙的故事，这是较早的一篇。作者用浪漫主义的手法，藉神怪的故事，表达了当时广大妇女们的愿望。',
      summary: '晋人已有关于狐仙的记载，但比较完整地描述狐仙的故事，这是较早的一篇。作者用浪漫主义的手法，藉神怪的故事，表达了当时广大妇女们的愿望。作者笔下的狐仙，实际上是人间的一个勇敢机智、善良的女性。她自愿和贫苦无依的青年郑六结合，帮助他成家立业，却不甘受豪门子弟韦崟的凌辱压迫，坚决和他作斗争，终于战胜了他。这表达了她对爱情的坚贞专一，为了自由和幸福，决不屈服于暴力。这是一种高贵的品质。另一方面，她有报恩思想，由于韦崟待她很好，她就代为设计诱骗别的女性来供他玩弄蹂躏。己所不欲，施之于人，这种行为与她的性格并不调和。这是作者失败的地方，也正反映了她思想上不健康的一面。故事很曲折，人物也塑造得相当生动。尤其是借家童口里，用烘云托月的方法，衬托出任氏的美丽，写得颇为成功。',
      image: 'https://img.zcool.cn/community/01e3c85e1f6f5da80120a8957c7227.jpg',
      originalText: '', // 待导入txt文件
      translatedText: '',
    },
    {
      // 序号 2: 离魂记
      title: '离魂记',
      author: '陈玄祐',
      dynasty: '唐',
      category: '传奇',
      theme: '爱情（士女恋）',
      mainCharacters: '倩娘；王宙',
      keywords: '离魂、自由恋爱、反封建',
      annotationCount: 36,
      description: '"倩女离魂"是一篇美丽动人的故事，表达了青年女子反对包办婚姻，力争自由恋爱的强烈感情，反映了反封建的进步思想。',
      summary: '"倩女离魂"是一篇美丽动人的故事，表达了青年女子反对包办婚姻，力争自由恋爱的强烈感情，反映了反封建的进步思想。尽管这是想象的故事，其细节却以现实生活为基础，这就在虚幻之中，予人以现实的感觉。这篇传奇表现了作者构思和描写两方面的擅长。元人郑德辉所作《迷青琐倩女离魂》杂剧，就是根据这一故事编写的。',
      image: 'https://img.zcool.cn/community/01e3c85e1f6f5da80120a8957c7227.jpg',
      originalText: '', // 待导入txt文件
      translatedText: '',
    },
    {
      // 序号 3: 柳氏传
      title: '柳氏传',
      author: '许尧佐',
      dynasty: '唐',
      category: '传奇',
      theme: '爱情（士女恋）',
      mainCharacters: '韩翊；柳氏；许俊；沙吒利',
      keywords: '悲欢离合、豪侠、妇女命运',
      annotationCount: 90,
      description: '本篇故事，也见于唐人孟启的《本事诗》，可能是根据真人实事而加工的。作者描写韩翊和柳氏的悲欢离合，情节曲折动人。',
      summary: '本篇故事，也见于唐人孟启的《本事诗》，可能是根据真人实事而加工的。作者描写韩翊和柳氏的悲欢离合，情节曲折动人。李生见柳氏爱上了韩翊，就促成他们的结合，使"有情人终成眷属"；许俊是一个勇敢而又机智的豪侠之士，他不畏艰险，代韩翊夺回柳氏，具有舍己为人的高尚品质。他们都是作者笔下的正面人物。另一方面，我们也可以看出，在封建社会里，妇女是没有独立的人格的。尽管李生同情柳氏和韩翊的相恋，只不过把她像货物一样地赠送给韩翊；当韩翊要去求取功名时，也就置柳氏于不顾。柳氏在变乱中欲求保身而不可得，竟被沙吒利强行劫去；后来，又被许俊夺了回来。任人摆弄，毫无自主之权，这一遭到侮辱与损害的女性的形象，真实地反映了当时妇女悲惨的命运。此外，作者所写的军人，是那样飞扬跋扈。一个立有战功的武将，就可以在京师横行无忌。当柳氏被夺回，事情败露之后，封建最高统治者并不敢予以处分，反而给予大量的金钱以为"抚慰"。这又暴露了当时封建统治阶级的黑暗情况。明人吴长儒、清人张国寿，曾根据这一故事，先后编写了《练囊记》和《章台柳》两剧。',
      image: 'https://img.zcool.cn/community/01e3c85e1f6f5da80120a8957c7227.jpg',
      originalText: '', // 待导入txt文件
      translatedText: '',
    },
  ];

  // 存储创建的书籍ID
  const createdBooks: { id: number; title: string }[] = [];

  for (let i = 0; i < books.length; i++) {
    const bookData = books[i];
    const book = await prisma.book.create({
      data: bookData,
    });
    createdBooks.push({ id: book.id, title: book.title });
    console.log(`创建书籍[${i + 1}]:`, book.title, `(ID: ${book.id})`);
  }

  // 为每本书创建角色（使用实际创建的书籍ID）
  const getBookId = (title: string) => {
    const book = createdBooks.find(b => b.title === title);
    return book ? book.id : 0;
  };

  const bookCharacters = [
    // 任氏传角色
    { bookId: getBookId('任氏传'), name: '任氏', description: '狐仙化身的女子，勇敢机智、善良坚贞，与郑六真心相爱' },
    { bookId: getBookId('任氏传'), name: '郑六', description: '贫苦无依的青年，与任氏结合后成家立业' },
    { bookId: getBookId('任氏传'), name: '韦崟', description: '豪门子弟，企图凌辱任氏但被其智斗战胜' },
    // 离魂记角色
    { bookId: getBookId('离魂记'), name: '倩娘', description: '张镒之女，端庄美丽，与王宙青梅竹马、情投意合' },
    { bookId: getBookId('离魂记'), name: '王宙', description: '张镒外甥，聪明机智，与倩娘深情相爱' },
    { bookId: getBookId('离魂记'), name: '张镒', description: '倩娘父亲，清河人，在衡州做官' },
    // 柳氏传角色
    { bookId: getBookId('柳氏传'), name: '韩翊', description: '才子，与柳氏相爱，后来仕途得意' },
    { bookId: getBookId('柳氏传'), name: '柳氏', description: '美丽善良的女子，命运多舛，历经悲欢离合' },
    { bookId: getBookId('柳氏传'), name: '许俊', description: '勇敢机智的豪侠之士，舍己为人' },
    { bookId: getBookId('柳氏传'), name: '沙吒利', description: '军中将领，强行劫走柳氏' },
  ];

  for (const charData of bookCharacters) {
    if (charData.bookId > 0) {
      await prisma.character.create({
        data: charData,
      });
    }
  }
  console.log('创建角色完成');

  console.log('播种完成！');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
