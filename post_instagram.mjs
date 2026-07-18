// 오늘의 카드 7장을 인스타그램 캐러셀로 게시한다 (Instagram API with Instagram Login).
// 필요한 환경변수:
//   IG_ACCESS_TOKEN : 장기 액세스 토큰 (60일)
//   IMAGE_BASE_URL  : 공개 이미지 폴더 URL (예: https://raw.githubusercontent.com/<user>/<repo>/main/out/2026-07-18)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.IG_ACCESS_TOKEN;
const BASE = (process.env.IMAGE_BASE_URL || '').replace(/\/$/, '');
const GRAPH = 'https://graph.instagram.com/v21.0';

if (!TOKEN || !BASE) {
  console.error('환경변수 IG_ACCESS_TOKEN / IMAGE_BASE_URL 이 필요합니다.');
  process.exit(1);
}

const patterns = JSON.parse(fs.readFileSync(path.join(__dirname, 'patterns.json'), 'utf8'));
function dayOfYear(d) { const s = new Date(d.getFullYear(), 0, 0); return Math.floor((d - s) / 86400000); }
const item = patterns[dayOfYear(new Date()) % patterns.length];
const CARD_COUNT = item.examples.length + 2; // intro + 예문 + outro = 7

function buildCaption(it) {
  const ex = it.examples.map((e) => `✔️ ${e.en}\n→ ${e.ko}`).join('\n\n');
  const tags = '#영어공부 #영어회화 #생활영어 #원어민표현 #영어표현 #데일리영어 #영어스터디 #하루한문장 #영어패턴 #영어카드뉴스 #engbite';
  return `📚 "${it.pattern}"\n${it.meaning}\n\n${ex}\n\n💡 저장해두고 소리 내어 연습해보세요!\n매일 한 문장씩, 원어민처럼 자연스럽게 🗣️\n\n팔로우 👉 @eng.bite_james\n.\n.\n${tags}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function igPost(pathStr, params) {
  const url = new URL(GRAPH + pathStr);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', TOKEN);
  const r = await fetch(url, { method: 'POST' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${pathStr} 실패: ${JSON.stringify(j)}`);
  return j;
}

// 이미지 공개 URL이 실제로 접근 가능해질 때까지 대기 (raw CDN 반영 지연 대비)
async function waitForImage(u, tries = 20) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(u, { method: 'HEAD' }); if (r.ok) return true; } catch {}
    await sleep(5000);
  }
  throw new Error('이미지 URL 접근 불가: ' + u);
}

const urls = Array.from({ length: CARD_COUNT }, (_, i) =>
  `${BASE}/card_${String(i + 1).padStart(2, '0')}.png`);

console.log('오늘 표현:', item.pattern, '| 카드', CARD_COUNT, '장');
await waitForImage(urls[0]);

// 1) 각 이미지 -> 캐러셀 아이템 컨테이너
const children = [];
for (let i = 0; i < urls.length; i++) {
  const c = await igPost('/me/media', { image_url: urls[i], is_carousel_item: 'true' });
  children.push(c.id);
  console.log(`아이템 ${i + 1} 컨테이너:`, c.id);
}

// 2) 캐러셀 컨테이너 (캡션 포함)
const carousel = await igPost('/me/media', {
  media_type: 'CAROUSEL',
  children: children.join(','),
  caption: buildCaption(item),
});
console.log('캐러셀 컨테이너:', carousel.id);

// 3) 컨테이너 준비 대기 후 게시
for (let i = 0; i < 20; i++) {
  const s = await fetch(`${GRAPH}/${carousel.id}?fields=status_code&access_token=${TOKEN}`).then((r) => r.json());
  if (s.status_code === 'FINISHED') break;
  if (s.status_code === 'ERROR') throw new Error('컨테이너 처리 오류: ' + JSON.stringify(s));
  await sleep(3000);
}
const pub = await igPost('/me/media_publish', { creation_id: carousel.id });
console.log('게시 완료! 미디어 ID:', JSON.stringify(pub));
