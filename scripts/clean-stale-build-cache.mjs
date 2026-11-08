import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 构建前自愈:清理带着旧绝对路径的构建缓存。
 *
 * Next.js 16 的 Turbopack 缓存(.next/cache/turbopack)与 MDX 生成产物(.source)
 * 会把构建时的绝对路径写进产物。项目一旦被移动目录(比如从 E:\hook\hook.tv
 * 挪到 E:\feint\hook.tv),这些缓存就指向一个已不存在的位置,表现为:
 *
 *   Error: Reading source code for parsing failed
 *   FileSystemPath("").join("../../hook/hook.tv/.source/source.config.mjs")
 *   leaves the filesystem root
 *
 * 这个脚本扫描缓存里是否还引用着「当前项目目录之外」的旧路径,命中就清掉
 * 对应的缓存目录,让下一次构建重新生成。不命中就什么都不做。
 */
const ROOT = resolve(process.cwd());

/** 需要检查的缓存目录:相对项目根 */
const CACHE_DIRS = ['.next/cache/turbopack', '.source'];

/** 单个文件超过这个大小就不扫描(二进制/大 bundle) */
const MAX_SCAN_BYTES = 8 * 1024 * 1024;

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(p);
    }
  }
  return out;
}

/**
 * 二进制文件里的随机字节经常凑成 "X:\xx" 这种形状,直接扫会误报。
 * 只把「看起来确实是路径」的字符串算命中:
 *   - 盘符后面至少两段目录
 *   - 路径字符不含控制字符与空白
 */
const WIN_PATH = /\b([A-Za-z]:[\\/](?:[^\\/:*?"<>|\s]+\\?)+)/g;

function looksLikeRealPath(p) {
  // 目录段数量 >= 2,排除 "C:\x" 这类随机字节
  const segments = p.split(/[\\/]/).filter(Boolean);
  if (segments.length < 3) return false;
  // 每段至少 2 个可见字符,随机字节通常不满足
  return segments.every((s) => s.length >= 2 && /^[\x20-\x7e]+$/.test(s));
}

/**
 * 含控制字符 = 二进制,跳过。
 * 按码位判断而不是正则字面量,避免在源码里塞不可见控制字符。
 */
function looksBinary(text) {
  const head = text.slice(0, 4096);
  for (let i = 0; i < head.length; i++) {
    const c = head.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32)) return true;
  }
  return false;
}

/**
 * 找出缓存里指向别的位置的绝对路径。
 * 只关心 Windows 盘符路径,避免误报 URL 和二进制噪音。
 */
function findForeignPaths(dir) {
  const hits = [];
  let scanned = 0;
  for (const file of listFiles(dir)) {
    let size;
    try {
      size = statSync(file).size;
    } catch {
      continue;
    }
    if (size > MAX_SCAN_BYTES) continue;

    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (looksBinary(text)) continue;
    scanned++;

    WIN_PATH.lastIndex = 0;
    const matched = text.match(WIN_PATH);
    if (!matched) continue;

    for (const p of matched) {
      if (!looksLikeRealPath(p)) continue;
      const norm = p.replace(/[\\/]+$/, '');
      if (!norm.toLowerCase().startsWith(ROOT.toLowerCase())) {
        hits.push({ file, path: norm });
        break;
      }
    }
  }
  return { hits, scanned };
}

let cleaned = 0;
for (const rel of CACHE_DIRS) {
  const dir = resolve(ROOT, rel);
  if (!existsSync(dir)) continue;

  const { hits, scanned } = findForeignPaths(dir);
  if (hits.length === 0) {
    console.log(
      `[prebuild] ${rel}: ${scanned} files scanned, no stale absolute path — keeping cache`
    );
    continue;
  }

  console.log(
    `[prebuild] ${rel}: found ${hits.length} file(s) referencing a path outside ${ROOT}`
  );
  for (const h of hits.slice(0, 5)) {
    console.log(`[prebuild]   ${h.path}  (in ${h.file})`);
  }
  rmSync(dir, { recursive: true, force: true });
  cleaned++;
  console.log(
    `[prebuild] removed ${rel} — it will be regenerated on this build`
  );
}

if (cleaned === 0) {
  console.log(
    '[prebuild] build cache is consistent with the current directory'
  );
}
