#!/usr/bin/env python3
"""Step 2 — 手：按 brief 生成 Replicate 执行计划并跑（默认 dry-run，不花钱）。

Usage:
  python3 produce.py --brief briefs/qf1_r1.json            # dry-run：打印计划+估算
  python3 produce.py --brief briefs/qf1_r1.json --execute --yes   # 真跑（先查余额）
  python3 produce.py --brief briefs/qf1_r1.json --execute --yes --qc  # 真跑+一致性门

模型输入 schema 已用 replicate.py model 实锤（2026-10-31）：
  wan-video/wan-2.2-animate-replace: video, character_image, resolution, merge_audio, seed
  cjwbw/sadtalker:                   driven_audio, source_image
  inworld/realtime-tts-2:            text, language, voice_id, audio_format
  google/nano-banana-2.1:            prompt, image_input, aspect_ratio, output_format
  bria/video-increase-resolution:    video_url, preserve_audio, desired_increase

角色一致性（2026-11-02）：
  - 定妆锚点：sadtalker source_image 与 wan-2.2 character_image 永远走
    anchor_portrait()（character.json portraits.front，兜底旧单张），不许硬编码路径。
  - DNA 锁死：定妆 prompt 末尾逐字追加 dna；wan-2.2 传拳手固定 seed。
    注意 nano-banana-2.1 没有 seed 参数（schema 实锤），锁靠 DNA 逐字 + 正面照 reference。
  - --qc：每段视频生成后跑 pipeline/qc.py，fail 自动重跑≤2 次，仍不过则移出装配。

可移植性（2026-11-08）：
  旧版硬依赖 Linux 绝对路径（~/workspace/custom-connectors/...、/opt/hatch/...），
  在本机 Windows 完全跑不起来。现在改为：
  - Replicate 走官方 replicate python 包 + REPLICATE_API_TOKEN
  - 本地文件上传走 FEINT_UPLOAD_URL（feint 站的预签名接口），无则回落到
    Replicate 官方 files API
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
QC = os.path.join(HERE, "qc.py")

sys.path.insert(0, HERE)
from draft import FIGHTERS  # noqa: E402  # dna/seed 作者源（character.json 优先）

# $/s 估算（第三方公开价，实锤见投入产出比文档；Replicate 以实际跑单为准）
COST = {
    "wan-video/wan-2.2-animate-replace": 0.08,
    "cjwbw/sadtalker": 0.02,
    "inworld/realtime-tts-2": 0.005,
    "google/nano-banana-2.1": 0.05,   # 按张
    "bria/video-increase-resolution": 0.03,
    "sync/lipsync-2-pro": 0.05,
}

# 成本档位（P2-8）：同一条片子，三根旋钮全程可控。
#   full     1080 / 重跑 3 次 —— 主打集
#   standard 720  / 重跑 2 次 —— 常规周更
#   lean     480  / 重跑 1 次 —— 预算吃紧
PROFILES = {
    "full": {"resolution": "1080", "retries": 3},
    "standard": {"resolution": "720", "retries": 2},
    "lean": {"resolution": "480", "retries": 1},
}

# 写实棚拍：wan-2.2 换角色会把 character_image 的脸与质感照搬到成片，
# 定妆照一旦是插画风，成片就变写实人 —— 两边必须同一套写实基准。
PORTRAIT_PROMPT = (
    "Photorealistic studio portrait photograph of a professional boxer, "
    "85mm lens, f/2.8, sharp focus on face, visible skin pores and sweat, "
    "dramatic rim lighting, dark arena background, "
    "centered, chest up, facing camera, front view.\n"
    "CHARACTER DNA (reproduce EXACTLY, do not alter): {dna}")


def fighter_slug(name):
    return name.lower().replace(" ", "_")


def load_character(fighter):
    """Character Bible：pipeline/assets/fighters/<slug>/character.json。"""
    p = os.path.join(ASSETS, "fighters", fighter_slug(fighter), "character.json")
    if os.path.exists(p):
        return json.load(open(p, encoding="utf-8"))
    return None


def fighter_dna(fighter):
    c = load_character(fighter)
    if c and c.get("dna"):
        return c["dna"]
    return FIGHTERS.get(fighter, {}).get("dna", "")


def fighter_seed(fighter):
    c = load_character(fighter)
    if c and c.get("seed"):
        return c["seed"]
    return FIGHTERS.get(fighter, {}).get("seed", 0)


def portrait_path(fighter):
    """旧单张定妆照（兜底）。新流程 3 视图在 assets/fighters/<slug>/。"""
    return os.path.join(ASSETS, "portraits", fighter.replace(" ", "_") + ".png")


def anchor_portrait(fighter):
    """定妆锚点——sadtalker source_image 与 wan-2.2 character_image 永远走这里。
    不许各处硬编码路径。"""
    c = load_character(fighter)
    if c:
        front = (c.get("portraits") or {}).get("front", "pending")
        if front and front != "pending":
            fp = os.path.join(HERE, front)
            if os.path.exists(fp):
                return fp
    return portrait_path(fighter)


# ---------------- Replicate 客户端 ----------------

def _replicate():
    """官方 replicate python 包；缺包或缺 token 时给出明确指引。"""
    try:
        import replicate  # noqa: PLC0415
    except ImportError:
        sys.exit("缺 replicate 包：pip install replicate")
    token = os.environ.get("REPLICATE_API_TOKEN", "")
    if not token:
        sys.exit("缺 REPLICATE_API_TOKEN 环境变量")
    os.environ.setdefault("REPLICATE_API_TOKEN", token)
    return replicate


def replicate_run(model, inputs, save):
    """跑一个 prediction，返回输出 URL。"""
    replicate = _replicate()
    out = replicate.run(model, input=inputs)
    url = str(out)
    with open(save, "w", encoding="utf-8") as f:
        json.dump({"output": url}, f, indent=2)
    return url


SADTALKER_VERSION = "a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3"  # cjwbw/sadtalker：模型名 endpoint 404，版本锁定可用（2026-11-03 实锤）


def replicate_run_version(version, inputs, save, timeout=1800):
    """版本锁定的 prediction（模型名 endpoint 坏掉时的逃生口）。Returns output URL."""
    replicate = _replicate()
    pred = replicate.predictions.create(version=version, input=inputs)
    deadline = time.time() + timeout
    while time.time() < deadline:
        pred = replicate.predictions.get(pred.id)
        status = pred.status
        print("poll %s status=%s" % (pred.id[:8], status), file=sys.stderr)
        if status in ("succeeded", "failed", "canceled"):
            with open(save, "w", encoding="utf-8") as f:
                json.dump({"output": str(pred.output) if pred.output else None},
                          f, indent=2)
            if not pred.output:
                raise RuntimeError("no output url: " + str(pred)[:300])
            if status != "succeeded":
                raise RuntimeError("prediction %s: %s" % (status, str(pred)[:300]))
            return str(pred.output)
        time.sleep(15)
    raise RuntimeError("timed out waiting for prediction %s" % pred.id)


def download(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    urllib.request.urlretrieve(url, dest)
    return dest


def upload_local(path):
    """本地文件 -> 公网 URL。

    优先用 feint 站的预签名直传接口（成片必须落自己的 R2，Replicate 中转 URL 48h 就过期）；
    没有配置时回落到 Replicate 官方 files API。
    """
    api = os.environ.get("FEINT_PRESIGN_URL", "").strip()
    token = os.environ.get("FEINT_ADMIN_TOKEN", "").strip()
    if api and token:
        name = os.path.basename(path)
        ctype = "video/mp4" if name.endswith(".mp4") else "application/octet-stream"
        body = json.dumps({
            "filename": name,
            "content_type": ctype,
            "size": os.path.getsize(path),
            "folder": "pipeline-tmp",
        }).encode()
        req = urllib.request.Request(
            api, data=body,
            headers={"Authorization": "Bearer " + token,
                     "Content-Type": "application/json"},
            method="POST")
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.loads(r.read().decode())
        signed = d.get("url") or ""
        if not signed:
            raise RuntimeError("presign returned no url")
        # 直传
        with open(path, "rb") as f:
            put = urllib.request.Request(
                signed, data=f.read(),
                headers={"Content-Type": ctype}, method="PUT")
            urllib.request.urlopen(put, timeout=900)
        return d.get("publicUrl") or signed.split("?")[0]

    replicate = _replicate()
    # Replicate 官方 files API（SDK 1.x: files.create, 旧版是 files.upload）
    import mimetypes  # noqa: PLC0415
    ctype = mimetypes.guess_type(path)[0] or "application/octet-stream"
    files = replicate.files
    make = getattr(files, "create", None) or getattr(files, "upload")
    uploaded = make(path, content_type=ctype)
    urls = getattr(uploaded, "urls", {}) or {}
    url = urls.get("get") or urls.get("url")
    if not url:
        raise RuntimeError("replicate file upload returned no url")
    return url


def _to_url(v):
    if isinstance(v, str) and os.path.exists(v):
        return upload_local(v)
    return v


def run_qc(video_path, fighter):
    """返回 0=通过 1=失败 2=跳过（无 key 等）。"""
    r = subprocess.run([sys.executable, QC, "--video", video_path,
                        "--fighter", fighter],
                       capture_output=True, text=True)
    print(r.stdout.strip(), file=sys.stderr)
    if r.stderr.strip():
        print(r.stderr.strip(), file=sys.stderr)
    return r.returncode


def check_balance():
    """确认 Replicate 可用（token 有效）。余额不公开显示,失败即阻断。"""
    replicate = _replicate()
    try:
        replicate.models.get("wan-video/wan-2.2-animate-replace")
    except Exception as e:
        sys.exit("Replicate 不可用（检查 REPLICATE_API_TOKEN 与余额）: %s" % e)
    print("replicate reachable", file=sys.stderr)


def build_plan(brief, resolution="720"):
    """Returns (plan, estimate_usd). plan = list of step dicts."""
    plan, est = [], 0.0
    bout = brief["bout_id"]
    rnd = brief["round"]
    workdir = os.path.join(ASSETS, "%s_r%s" % (bout, rnd))

    # 0. 定妆照（缺啥补啥，缓存=真理源；DNA 锁死 prompt）
    for f in brief["fighters"]:
        pp = portrait_path(f)
        if not os.path.exists(anchor_portrait(f)):
            plan.append({"id": "portrait-" + f, "model": "google/nano-banana-2.1",
                         # nano-banana-2.1 无 seed 参数：锁 = DNA 逐字
                         "inputs": {"prompt": PORTRAIT_PROMPT.format(
                             dna=fighter_dna(f)),
                             "aspect_ratio": "3:4", "output_format": "png"},
                         "save": pp, "kind": "image", "fighter": f})
            est += COST["google/nano-banana-2.1"]

    for seg in brief.get("segments", []):
        sid = seg["id"]
        dur = seg.get("duration_s", 10)
        fighter = seg.get("fighter", brief["fighters"][0])
        if seg["type"] == "fight":
            plan.append({"id": sid, "model": "wan-video/wan-2.2-animate-replace",
                         "inputs": {"video": seg.get("reference", ""),
                                    "character_image": anchor_portrait(fighter),
                                    "resolution": resolution, "merge_audio": True,
                                    "seed": fighter_seed(fighter)},
                         "save": os.path.join(workdir, sid + ".mp4"),
                         "kind": "video", "fighter": fighter})
            est += dur * COST["wan-video/wan-2.2-animate-replace"]
        elif seg["type"] == "trash_talk":
            f = seg["fighter"]
            plan.append({"id": sid + "-tts", "model": "inworld/realtime-tts-2",
                         "inputs": {"text": seg["line"], "language": "en",
                                    "audio_format": "mp3"},
                         "save": os.path.join(workdir, sid + ".mp3"),
                         "kind": "audio", "fighter": f})
            est += dur * COST["inworld/realtime-tts-2"]
            plan.append({"id": sid, "model": "cjwbw/sadtalker",
                         "version": SADTALKER_VERSION,
                         "inputs": {"driven_audio": "{prev:" + sid + "-tts}",
                                    "source_image": anchor_portrait(f)},
                         "save": os.path.join(workdir, sid + ".mp4"),
                         "kind": "video", "needs": sid + "-tts", "fighter": f})
            est += dur * COST["cjwbw/sadtalker"]
    # 收尾超分（可选，默认开；desired_increase 如报错改为 verify）
    plan.append({"id": "upscale-note",
                 "note": "bria 超分在 assemble 后对成片跑：bria/video-increase-resolution "
                         "{video_url, preserve_audio:true, desired_increase:'2x'}"})
    return plan, round(est, 2)


def execute(plan, workdir, use_qc=False, retries=2):
    urls = {}
    for step in plan:
        if "model" not in step:
            print("NOTE: " + step.get("note", ""), file=sys.stderr)
            continue
        inputs = dict(step["inputs"])
        # {prev:xxx} 引用上一步的输出 URL；本地文件自动转公网 URL
        for k, v in list(inputs.items()):
            if isinstance(v, str) and v.startswith("{prev:"):
                ref = v[6:-1]
                inputs[k] = urls[ref]
            else:
                inputs[k] = _to_url(v)
        dest = step["save"]
        if os.path.exists(dest):
            print("SKIP (exists): " + dest, file=sys.stderr)
            urls[step["id"]] = upload_local(dest)  # {prev:} 引用仍需 URL
            continue
        tries = 0
        while True:
            print("RUN %s <- %s (try %d)" % (step["id"], step["model"], tries + 1),
                  file=sys.stderr)
            if step.get("version"):
                out_url = replicate_run_version(step["version"], inputs, dest + ".json")
            else:
                out_url = replicate_run(step["model"], inputs, dest + ".json")
            download(out_url, dest)
            urls[step["id"]] = out_url
            print("  -> " + dest, file=sys.stderr)
            if not use_qc or step.get("kind") != "video":
                break
            rc = run_qc(dest, step.get("fighter", ""))
            if rc == 0 or rc == 2:
                break  # 通过 / 跳过
            tries += 1
            if tries >= retries:
                # 导演喊卡：废片移出装配
                bad = dest + ".qc_failed"
                os.rename(dest, bad)
                print("QC %d 次不过，废片移出装配: %s" % (retries, bad),
                      file=sys.stderr)
                break
            print("QC FAIL，重跑该段（%d/%d）" % (tries, retries - 1),
                  file=sys.stderr)
    return urls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--brief", required=True)
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--yes", action="store_true", help="确认花钱")
    ap.add_argument("--qc", action="store_true",
                     help="一致性门：每段视频过 qc.py，fail 重跑≤N 次")
    ap.add_argument("--profile", default=os.environ.get("HOOK_COST_PROFILE", "standard"),
                     choices=list(PROFILES), help="成本档位(P2-8)")
    ap.add_argument("--max-usd", type=float, default=float(os.environ.get("MONTHLY_BUDGET_USD", "0") or 0),
                     help="本次预算上限(美元),超出直接阻断")
    a = ap.parse_args()

    prof = PROFILES[a.profile]
    brief = json.load(open(a.brief, encoding="utf-8-sig"))
    plan, est = build_plan(brief, resolution=prof["resolution"])
    plan_path = a.brief.replace(".json", ".plan.json")
    json.dump({"plan": plan, "estimate_usd": est, "profile": a.profile},
              open(plan_path, "w"), indent=2)
    print("plan -> " + plan_path)
    print("profile: %s (resolution=%s, retries=%d)"
          % (a.profile, prof["resolution"], prof["retries"]))
    print("estimated cost: $%.2f" % est)
    for s in plan:
        print("  - %-22s %s" % (s["id"], s.get("model", s.get("note", ""))[:60]))

    if not a.execute:
        print("\ndry-run 结束（没花钱）。加 --execute --yes 真跑。")
        return
    if not a.yes:
        sys.exit("真跑需要 --yes（防止手滑烧钱）")
    if a.max_usd and est > a.max_usd:
        sys.exit("预算阻断：预估 $%.2f > 上限 $%.2f。降档(--profile lean)或调高上限。"
                 % (est, a.max_usd))
    check_balance()
    execute(plan, os.path.join(ASSETS), use_qc=a.qc, retries=prof["retries"])


if __name__ == "__main__":
    main()
