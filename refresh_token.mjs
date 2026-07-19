// 인스타그램 장기 토큰을 갱신(60일 연장)하고, 새 토큰으로 GitHub 시크릿 IG_ACCESS_TOKEN 을 업데이트한다.
// 필요한 환경변수:
//   IG_ACCESS_TOKEN   : 현재 장기 토큰
//   GH_PAT            : 이 저장소의 'Secrets: read/write' 권한을 가진 PAT
//   GITHUB_REPOSITORY : owner/repo (Actions가 자동 주입)
import sodium from 'libsodium-wrappers';

const TOKEN = process.env.IG_ACCESS_TOKEN;
const PAT = process.env.GH_PAT;
const REPO = process.env.GITHUB_REPOSITORY;
if (!TOKEN || !PAT || !REPO) {
  console.error('환경변수 IG_ACCESS_TOKEN / GH_PAT / GITHUB_REPOSITORY 가 필요합니다.');
  process.exit(1);
}

// 1) 인스타 토큰 갱신 (24시간 이상 된 토큰만 갱신 가능)
const r = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${TOKEN}`);
const j = await r.json().catch(() => ({}));
if (!r.ok || !j.access_token) throw new Error('토큰 갱신 실패: ' + JSON.stringify(j));
const newToken = j.access_token;
console.log('인스타 토큰 갱신 성공. 남은 유효기간(초):', j.expires_in);

// GitHub API 헬퍼
const api = (path, opts = {}) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  ...opts,
  headers: {
    Authorization: `Bearer ${PAT}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(opts.headers || {}),
  },
});

// 2) 저장소 Actions 공개키 조회
const pk = await api('/actions/secrets/public-key').then((x) => x.json());
if (!pk.key) throw new Error('공개키 조회 실패(PAT 권한 확인): ' + JSON.stringify(pk));

// 3) libsodium 봉인 암호화 (GitHub 시크릿 규격)
await sodium.ready;
const encrypted = sodium.crypto_box_seal(
  sodium.from_string(newToken),
  sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL),
);
const encrypted_value = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);

// 4) 시크릿 업데이트
const put = await api('/actions/secrets/IG_ACCESS_TOKEN', {
  method: 'PUT',
  body: JSON.stringify({ encrypted_value, key_id: pk.key_id }),
});
if (put.status === 201 || put.status === 204) {
  console.log('IG_ACCESS_TOKEN 시크릿 업데이트 완료 ✅');
} else {
  throw new Error('시크릿 업데이트 실패: ' + put.status + ' ' + (await put.text()));
}
