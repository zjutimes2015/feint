/**
 * Client-only device helpers. 所有 window/document 访问均有 SSR 守卫。
 */

export function cyrb53(str: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

export function canvasFP(): string {
  if (typeof document === 'undefined') return 'nocanvas';
  try {
    const c = document.createElement('canvas');
    c.width = 220;
    c.height = 40;
    const x = c.getContext('2d');
    if (!x) return 'nocanvas';
    x.textBaseline = 'top';
    x.font = '16px Arial';
    x.fillStyle = '#f60';
    x.fillRect(10, 5, 100, 25);
    x.fillStyle = '#069';
    x.font = 'italic 18px "Times New Roman"';
    x.fillText('BRAWLVERSE!', 12, 8);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgba(255,0,255,0.6)';
    x.beginPath();
    x.arc(160, 20, 18, 0, 7);
    x.fill();
    return c.toDataURL();
  } catch {
    return 'nocanvas';
  }
}

export function webglFP(): string {
  if (typeof document === 'undefined') return 'nowebgl';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') ||
      c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'nowebgl';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info') as {
      UNMASKED_VENDOR_WEBGL: number;
      UNMASKED_RENDERER_WEBGL: number;
    } | null;
    const vendor = dbg
      ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const renderer = dbg
      ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return String(vendor) + '|' + String(renderer);
  } catch {
    return 'nowebgl';
  }
}

export function deviceFingerprint(): string {
  if (typeof window === 'undefined' || typeof navigator === 'undefined')
    return '';
  const p: string[] = [];
  p.push(canvasFP());
  p.push(webglFP());
  p.push(
    [
      screen.width,
      screen.height,
      screen.colorDepth,
      window.devicePixelRatio || 1,
    ].join('x')
  );
  try {
    p.push(
      Intl.DateTimeFormat().resolvedOptions().timeZone +
        '|' +
        new Date().getTimezoneOffset()
    );
  } catch {
    p.push('notz');
  }
  p.push(navigator.language + '|' + (navigator.languages || []).join(','));
  const nav = navigator as Navigator & { deviceMemory?: number };
  p.push(
    navigator.platform +
      '|' +
      navigator.hardwareConcurrency +
      '|' +
      (nav.deviceMemory || '?')
  );
  p.push('ontouchstart' in window ? 'touch' : 'notouch');
  p.push(navigator.userAgent);
  const s = p.join('###');
  return 'fp-' + cyrb53(s, 7) + cyrb53(s, 99);
}

/** Stable per-browser id; falls back to a stored random id when fingerprint collection fails. */
export function deviceId(): string {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined')
    return '';
  try {
    const fp = deviceFingerprint();
    if (fp && fp.length > 12) return fp;
  } catch {
    // fall through to the stored random id
  }
  let d = localStorage.getItem('bv_device');
  if (!d) {
    d = 'dev-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('bv_device', d);
  }
  return d;
}
