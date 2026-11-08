#!/usr/bin/env python3
"""Step 5 — 发布：把合成好的正片写进内容库并置 published。

这是 P0-1 从 0 到 1 的最后一步：assemble 出的是本地 mp4，
不写进 content_items 的话 /episodes 永远看不到它。

用法：
  CONTENT_PUBLISH_TOKEN=xxx python3 publish.py \
      --video out/qf1_r1_vertical.mp4 --id ep-qf1-r1 \
      --title "IRON JAW vs VIPER — Round 1" --week-key 2026-W45

零成本托管：默认把成片复制到 web 的 public/brawlverse/ 下，
video_url 用相对路径 /brawlverse/<id>.mp4，由站点自己托管。
若已有 CDN/R2，传 --no-copy 并显式给 --video-url。

合规（P2-9）：正片发布必须带 AIGC 披露标记；本脚本强制 meta.aigc_disclosed=true。
"""
import argparse
import json
import os
import shutil
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
PUBLIC_BRAWL = os.path.join(REPO, "public", "brawlverse")


def post(api_base, token, payload, timeout=60):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        api_base.rstrip("/") + "/api/content?op=upsert",
        data=body,
        headers={
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit("publish failed HTTP %s: %s" % (e.code, e.read().decode(errors="ignore")))
    except urllib.error.URLError as e:
        sys.exit("publish failed: %s" % e)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True, help="assemble 产出的本地 mp4")
    ap.add_argument("--id", required=True, help="content_items 主键,如 ep-qf1-r1")
    ap.add_argument("--title", required=True)
    ap.add_argument("--week-key", default="")
    ap.add_argument("--poster", default="")
    ap.add_argument("--shots", type=int, default=0, help="本集镜头数,用于校验 20–40")
    ap.add_argument("--api-base", default=os.environ.get("HOOK_API_BASE", "http://localhost:3000"))
    ap.add_argument("--token", default=os.environ.get("CONTENT_PUBLISH_TOKEN", ""))
    ap.add_argument("--video-url", default="", help="显式成片地址(CDN/R2),给了就不复制")
    ap.add_argument("--no-copy", action="store_true", help="不复制到 public/brawlverse")
    ap.add_argument("--status", default="published", choices=["draft", "review", "published"])
    a = ap.parse_args()

    if not os.path.exists(a.video):
        sys.exit("video not found: " + a.video)
    if os.path.getsize(a.video) < 1024:
        sys.exit("video too small, likely a failed render: " + a.video)
    if not a.token and a.status == "published":
        sys.exit("CONTENT_PUBLISH_TOKEN required to publish (set env or --token)")
    if a.shots and not (20 <= a.shots <= 40):
        sys.exit("shots=%d 不在 20–40,不是一集完整正片" % a.shots)

    video_url = a.video_url
    if not video_url:
        if a.no_copy:
            sys.exit("--no-copy requires --video-url")
        os.makedirs(PUBLIC_BRAWL, exist_ok=True)
        name = a.id.replace("/", "_") + ".mp4"
        dst = os.path.join(PUBLIC_BRAWL, name)
        shutil.copyfile(a.video, dst)
        video_url = "/brawlverse/" + name
        print("copied -> " + dst)

    payload = {
        "id": a.id,
        "kind": "episode",
        "title": a.title,
        "week_key": a.week_key,
        "provider": "pipeline",
        "video_url": video_url,
        "poster_url": a.poster,
        "status": a.status,
        "meta": {
            "aigc_disclosed": True,
            "shots": a.shots,
            "source": "run_episode.py",
        },
    }
    res = post(a.api_base, a.token, payload)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    print("published -> " + a.id + "  " + video_url)


if __name__ == "__main__":
    main()
