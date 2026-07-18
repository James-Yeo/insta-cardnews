// 헤드리스 크로미움으로 render.html의 카드 7장을 1080x1080 PNG로 캡처한다.
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR
  ? path.resolve(__dirname, process.env.OUT_DIR)
  : path.join(__dirname, 'out');
fs.mkdirSync(OUT_DIR, { recursive: true });

let url = pathToFileURL(path.join(__dirname, 'render.html')).href;
if (process.env.PATTERN_INDEX) url += `?i=${process.env.PATTERN_INDEX}`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1080, height: 1080 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
await page.waitForTimeout(600); // 렌더/폰트 안정화

const cards = await page.$$('.card');
if (cards.length === 0) throw new Error('카드를 찾지 못함 (patterns.js 로드 실패?)');

for (let i = 0; i < cards.length; i++) {
  const file = path.join(OUT_DIR, `card_${String(i + 1).padStart(2, '0')}.png`);
  await cards[i].screenshot({ path: file });
  console.log('saved', file);
}
await browser.close();
console.log(`완료: ${cards.length}장 -> ${OUT_DIR}`);
