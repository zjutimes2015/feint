/**
 * 动作库同步测试：TS 镜像与唯一真源不得漂移。
 *
 * 真源：pipeline/assets/mixamo/manifest.json（v3，FBX 在 fbx/ 子目录）。
 * 镜像：src/lib/arena/actions.ts（引擎招式 / 回合事件 → clip）
 *       src/lib/brawlverse/actions.ts（clip 目录 + 战术序列）
 *
 * 改动作库的流程：先改 manifest.json，再改两个 actions.ts，最后跑本测试。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BOUT_EVENT_ACTIONS,
  COMBOS,
  MOVE_ACTIONS,
} from '../../../src/lib/arena/actions';
import { MOVE_IDS } from '../../../src/lib/arena/engine';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const ASSET_DIR = path.join(ROOT, 'pipeline', 'assets', 'mixamo');
const MANIFEST_PATH = path.join(ASSET_DIR, 'manifest.json');

interface ManifestClip {
  id: string;
  fbx: string | null;
  category: string;
  status: 'present' | 'mirror' | 'fallback';
  wanted_id: string;
  engine: string[];
  move_ids: string[];
  tactics: string[];
  note?: string;
  reason?: string;
  mirror_of?: string;
  approx_of?: string;
}

interface AssetManifest {
  paths: { fbx_dir: string; mp4_dir: string };
  moves: Record<string, { clip: string | null; status: string }>;
  events: Record<string, { clip: string | null; status: string }>;
  combos: Record<string, { clips: string[] }>;
  tactic_sequences: Record<string, string[]>;
  clips: ManifestClip[];
}

function loadJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf-8')) as T;
}

const manifest = loadJson<AssetManifest>(MANIFEST_PATH);
const FBX_DIR = path.join(ROOT, 'pipeline', manifest.paths.fbx_dir);
const clipById = new Map(manifest.clips.map((c) => [c.id, c]));

describe('arena action library sync', () => {
  it('every engine move has a TS mapping', () => {
    for (const move of MOVE_IDS) {
      expect(MOVE_ACTIONS[move]).toBeDefined();
    }
    expect(Object.keys(MOVE_ACTIONS).sort()).toEqual([...MOVE_IDS].sort());
  });

  it('TS move map matches the manifest', () => {
    expect(Object.keys(MOVE_ACTIONS).sort()).toEqual(
      Object.keys(manifest.moves).sort()
    );
    for (const [move, ref] of Object.entries(MOVE_ACTIONS)) {
      const want = manifest.moves[move];
      expect(ref.clip).toBe(want.clip);
      expect(ref.status).toBe(want.status);
    }
  });

  it('TS event map matches the manifest', () => {
    expect(Object.keys(BOUT_EVENT_ACTIONS).sort()).toEqual(
      Object.keys(manifest.events).sort()
    );
    for (const [event, ref] of Object.entries(BOUT_EVENT_ACTIONS)) {
      const want = manifest.events[event];
      expect(ref.clip).toBe(want.clip);
      expect(ref.status).toBe(want.status);
    }
  });

  it('TS combos match the manifest', () => {
    expect(Object.keys(COMBOS).sort()).toEqual(
      Object.keys(manifest.combos).sort()
    );
    for (const [name, clips] of Object.entries(COMBOS)) {
      expect([...clips]).toEqual(manifest.combos[name].clips);
    }
  });

  it('every referenced clip exists in the manifest', () => {
    const referenced = new Set<string>();
    for (const ref of Object.values(MOVE_ACTIONS)) {
      if (ref.clip) referenced.add(ref.clip);
    }
    for (const ref of Object.values(BOUT_EVENT_ACTIONS)) {
      if (ref.clip) referenced.add(ref.clip);
    }
    for (const clips of Object.values(COMBOS)) {
      for (const clip of clips) referenced.add(clip);
    }
    for (const seq of Object.values(manifest.tactic_sequences)) {
      for (const clip of seq) referenced.add(clip);
    }
    for (const clip of referenced) {
      expect(clipById.has(clip)).toBe(true);
    }
  });

  it('every present clip file exists in fbx/, no orphan FBX', () => {
    const onDisk = readdirSync(FBX_DIR).filter((f) =>
      f.toLowerCase().endsWith('.fbx')
    );
    const inManifest = new Set(
      manifest.clips.filter((c) => c.fbx).map((c) => c.fbx as string)
    );
    for (const clip of manifest.clips) {
      if (clip.status === 'present') {
        expect(clip.fbx).not.toBeNull();
        expect(existsSync(path.join(FBX_DIR, clip.fbx as string))).toBe(true);
      }
    }
    for (const file of onDisk) {
      expect(inManifest.has(file)).toBe(true);
    }
    expect(onDisk.length).toBe(25);
  });

  it('mirror and fallback clips resolve to a present clip', () => {
    for (const clip of manifest.clips) {
      if (clip.status === 'mirror') {
        const source = clipById.get(clip.mirror_of as string);
        expect(source).toBeDefined();
        expect(source?.status).toBe('present');
        expect(clip.fbx).toBeNull();
      }
      if (clip.status === 'fallback') {
        const source = clipById.get(clip.approx_of as string);
        expect(source).toBeDefined();
        expect(source?.status).toBe('present');
        expect(clip.reason).toBeTruthy();
      }
    }
    expect(
      manifest.clips.filter((c) => c.status === 'mirror').map((c) => c.id)
    ).toEqual(['defense_dodge_l']);
    expect(
      manifest.clips.filter((c) => c.status === 'fallback').map((c) => c.id)
    ).toEqual(['defense_clinch']);
  });

  it('knockdown uses its own real FBX', () => {
    const knockdown = clipById.get('react_knockdown');
    expect(knockdown?.status).toBe('present');
    expect(knockdown?.fbx).toBe('reaction_knockdown.fbx');
  });

  it('all 27 wanted clips are adjudicated in the manifest', () => {
    expect(manifest.clips.length).toBe(27);
    const ids = new Set(manifest.clips.map((c) => c.id));
    expect(ids.size).toBe(27);
    for (const c of manifest.clips) {
      expect(c.wanted_id).toBeTruthy();
    }
  });

  it('every tactic sequence only uses real clips', () => {
    const tactics = Object.keys(manifest.tactic_sequences).sort();
    expect(tactics).toEqual(['dodge', 'fair', 'guard', 'heavy', 'rage']);
    for (const seq of Object.values(manifest.tactic_sequences)) {
      expect(seq.length).toBeGreaterThan(0);
      for (const id of seq) {
        expect(clipById.has(id)).toBe(true);
      }
    }
  });

  it('clip engine lists only reference real move/event keys', () => {
    const keys = new Set([
      ...Object.keys(manifest.moves),
      ...Object.keys(manifest.events),
    ]);
    for (const clip of manifest.clips) {
      for (const key of clip.engine) {
        expect(keys.has(key)).toBe(true);
      }
    }
  });
});
