#!/usr/bin/env python3
"""
Batch-generate game assets via ComfyUI HTTP API.

Reads `assets_manifest.csv`, queues each row to ComfyUI, waits for the result,
and writes the image to the target path under `public/assets/...`.

Usage:
    # 1. Start ComfyUI:  python main.py --listen 127.0.0.1 --port 8188
    # 2. Open ComfyUI in your browser, load your favorite txt2img workflow,
    #    then click "Save (API Format)" and save as `comfy_workflow.json` here.
    # 3. Run this script:
    #    python scripts/run_comfyui_batch.py --workflow scripts/comfy_workflow.json
    #
    # Optional flags:
    #    --only npc          # only NPC portraits (transparent PNGs)
    #    --only bg           # only backgrounds
    #    --filter 736        # only filenames containing "736"
    #    --skip-existing     # don't re-generate files that already exist
    #    --style "..."       # extra style suffix appended to every prompt
    #    --negative "..."    # negative prompt
    #    --seed 12345        # base seed (each row gets seed + index for reproducibility)
    #    --host 127.0.0.1:8188
    #    --manifest scripts/assets_manifest_dante.csv   # alternate character line
    #    --preset dante      # medieval style preset for the Dante line
    #    --preset rumi       # Persian miniature preset for the Rumi line
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

# ---- Unified style: Tang Dynasty 工笔重彩 (gongbi heavy color) ---------------
# Single base style for ALL asset types — characters, backgrounds, props — so the
# whole game looks like one painter did it. Per-type composition modifiers are
# layered on top via TYPE_MODIFIER below.
BASE_STYLE_ZH = (
    "中国唐代工笔重彩画风, gongbi heavy-color Tang Dynasty painting, "
    "细线勾勒工整严谨, 矿物颜料平涂叠染, 朱砂石青石绿赭黄主色, "
    "唐代服饰建筑器物严格考证, 半写实, 优雅典丽, "
    "无文字水印, 无现代元素, 高质量, 8k"
)
TYPE_MODIFIER = {
    "bg":   "电影感构图, 16:9 横构图, 前景中部留白, 温暖典雅暮色调, 柔光",
    "npc":  "人物立绘居中, 半写实人物面部, 解剖准确",
    "dufu": "人物立绘居中, 半写实人物面部, 解剖准确",
    "dante": "人物立绘居中, 半写实人物面部, 解剖准确",
    "rumi": "人物立绘居中, 半写实人物面部, 解剖准确",
    # Note: prop does NOT use BASE_STYLE_ZH (see PROP_FULL_STYLE_ZH below).
    # The "工笔重彩" wording in BASE_STYLE makes the model paint figures onto
    # objects (turning a wine jar into a decorated vase). At CFG=1 (Z-Image
    # Turbo / Flux schnell) negative prompts are ignored, so we MUST fix it on
    # the positive side by giving props a completely separate style string.
    "prop": None,
}
PROP_FULL_STYLE_ZH = (
    # FLAT 2D gongbi illustration OF the artifact (not a 3D photo of an object
    # with paintings on it). Reference: 博古图 (Bogu — Chinese antiquities
    # painting tradition: flat line-drawing + flat color washes of single objects).
    "中国传统博古图风格, Chinese Bogu antiquities painting style, "
    "工笔白描淡彩平面插画, gongbi flat line-drawing with light color wash, "
    "flat 2D illustration of a single Tang Dynasty artifact, "
    "黑色细线勾勒轮廓, fine black ink line outlines, "
    "矿物颜料平涂, flat mineral pigment fill, no shading no gradient, "
    "no perspective no 3D rendering, no photo realism, "
    "single object centered, plain off-white paper background, "
    "无任何人物, 无场景, 无装饰花纹, 无文字水印, 无现代元素"
)
DEFAULT_NEG = (
    "text, watermark, signature, modern, anachronism, chibi, anime style, "
    "harsh contrast, oversaturation, blurry, low quality, deformed, extra fingers, "
    "ink wash sketch, loose brushwork"  # we want gongbi precision, not loose ink-wash
)
# Extra negatives applied only to props to suppress decorative-painting interpretation.
PROP_EXTRA_NEG = (
    ", figures painted on object, scenes painted on object, decorative patterns, "
    "people on the object, multiple objects, ornate decoration, painted vase, "
    "ceramic with figures, sancai pottery decoration"
)
# Transparent-bg tails differ for characters vs. props (different anatomy hints).
CHAR_TRANSPARENT_TAIL = (
    ", 透明背景, transparent background, isolated character on alpha, no scenery, "
    "full-body portrait centered, feet visible, standing pose, full figure from head to toe"
)

# ---- Dante line: late-medieval Italian style (Giotto fresco × illuminated MS) --
# Same layering logic as the Tang preset; selected via --preset dante.
DANTE_BASE_STYLE_ZH = (
    "中世纪晚期意大利画风, late medieval Italian painting, "
    "乔托湿壁画与泥金手抄本混合风格, Giotto fresco and illuminated manuscript hybrid style, "
    "蛋彩画质感, 细线勾勒, 平涂叠染, 群青朱红赭石金箔主色, "
    "13至14世纪意大利服饰建筑器物严格考证, 半写实, 庄重典雅, "
    "无文字水印, 无现代元素, 高质量, 8k"
)
DANTE_PROP_FULL_STYLE_ZH = (
    "中世纪泥金手抄本器物插画风格, medieval illuminated manuscript object illustration, "
    "平面2D插画, flat 2D illustration of a single medieval artifact, "
    "黑色细线勾勒轮廓, fine ink line outlines, 平涂淡彩, flat light color wash, "
    "no shading no gradient, no perspective no 3D rendering, no photo realism, "
    "single object centered, plain parchment background, "
    "无任何人物, 无场景, 无装饰边框, 无文字水印, 无现代元素"
)
DANTE_EXTRA_NEG = (
    ", Chinese elements, Asian architecture, hanfu, kimono, ink wash painting, "
    "Tang Dynasty style"
    # NOTE: do NOT put nose words here. At CFG=1 (Turbo/schnell) negatives are
    # ignored entirely, and in the positive prompt every extra mention of the
    # nose amplifies it. Nose is described ONCE, briefly, in the manifest.
)

# ---- Rumi line: Persian miniature (Ilkhanid → Timurid manuscript painting) ----
# 鲁米同时代（13 世纪）的波斯绘画存世很少；最接近的是 14 世纪初伊儿汗朝抄本插画
# （如《史集》《大蒙古列王纪》），再往后是帖木儿朝的成熟细密画。取二者之间的画风。
RUMI_BASE_STYLE_ZH = (
    "波斯细密画风格, Persian miniature painting, "
    "伊儿汗与帖木儿时期抄本插画, Ilkhanid and Timurid manuscript illustration, "
    "平面构图多视点, flat multi-viewpoint composition, 细线勾勒, 矿物颜料平涂, "
    "青金石蓝 绿松石 朱红 赭石 金箔主色, lapis lazuli turquoise vermilion ochre and gold palette, "
    "13世纪呼罗珊与安纳托利亚服饰建筑器物考证, 半写实, 典雅宁静, "
    "无可读文字, 无文字水印, 无现代元素, 高质量, 8k"
)
RUMI_PROP_FULL_STYLE_ZH = (
    "波斯抄本器物插画风格, Persian manuscript object illustration, "
    "平面2D插画, flat 2D illustration of a single 13th century Persian or Seljuk artifact, "
    "黑色细线勾勒轮廓, fine ink line outlines, 矿物颜料平涂, flat mineral color, "
    "no shading no gradient, no perspective no 3D rendering, no photo realism, "
    "single object centered, plain paper background, "
    "无任何人物, 无场景, 无装饰边框, 无文字水印, 无现代元素"
)
RUMI_EXTRA_NEG = (
    ", Chinese elements, hanfu, Tang Dynasty style, Italian fresco, Gothic architecture, "
    "European medieval, Arabic text, readable calligraphy, Ottoman 16th century costume, fez"
    # 同但丁线的教训：CFG=1（Turbo/schnell）时 negative 整个被忽略，
    # 真正起作用的约束要写在 positive 里（base style 已写「无可读文字」）。
    # 1258「中国画师」那张需要中国元素——在 CSV 的 prompt 里正面写明即可。
)

# Style presets: base style for characters/backgrounds, full style for props,
# and preset-specific extra negatives.
STYLE_PRESETS = {
    "tang": {"base": None, "prop": None, "extra_neg": ""},  # filled below (defaults)
    "dante": {
        "base": DANTE_BASE_STYLE_ZH,
        "prop": DANTE_PROP_FULL_STYLE_ZH,
        "extra_neg": DANTE_EXTRA_NEG,
    },
    "rumi": {
        "base": RUMI_BASE_STYLE_ZH,
        "prop": RUMI_PROP_FULL_STYLE_ZH,
        "extra_neg": RUMI_EXTRA_NEG,
    },
}
PROP_TRANSPARENT_TAIL = (
    ", 透明背景, transparent background, isolated single object on alpha, "
    "no scenery, no shadow, centered single object"
)


# ---- ComfyUI HTTP helpers ----------------------------------------------------
def post_prompt(host: str, workflow: dict, client_id: str) -> str:
    payload = {"prompt": workflow, "client_id": client_id}
    req = urllib.request.Request(
        f"http://{host}/prompt",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as r:
        body = json.loads(r.read())
    return body["prompt_id"]


def get_history(host: str, prompt_id: str) -> dict:
    with urllib.request.urlopen(f"http://{host}/history/{prompt_id}") as r:
        return json.loads(r.read())


def get_image(host: str, filename: str, subfolder: str, image_type: str) -> bytes:
    params = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": image_type}
    )
    with urllib.request.urlopen(f"http://{host}/view?{params}") as r:
        return r.read()


def wait_for_completion(host: str, prompt_id: str, timeout: int = 600) -> dict:
    """Poll /history until the prompt completes; return the history entry."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        hist = get_history(host, prompt_id)
        if prompt_id in hist:
            return hist[prompt_id]
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for prompt {prompt_id}")


# ---- Workflow patching -------------------------------------------------------
def find_node_by_class(workflow: dict, class_type: str) -> str | None:
    for nid, node in workflow.items():
        if node.get("class_type") == class_type:
            return nid
    return None


def find_all_by_class(workflow: dict, class_type: str) -> list[str]:
    return [nid for nid, node in workflow.items() if node.get("class_type") == class_type]


def _node_id_key(nid: str):
    """Sort key handling simple ('5') and subgraph ('104:90') node IDs."""
    try:
        return tuple(int(p) for p in str(nid).split(":"))
    except ValueError:
        return (float("inf"), str(nid))


def patch_workflow(
    workflow: dict,
    positive: str,
    negative: str,
    width: int,
    height: int,
    seed: int,
    save_prefix: str,
) -> dict:
    """Mutate a copy of the workflow with our per-row settings.

    Supports two workflow styles:
      - Standard SDXL/SD1.5: 2+ CLIPTextEncode nodes (positive + negative).
        First by node-id = positive, second = negative.
      - Z-Image Turbo / Flux schnell (CFG=1): single CLIPTextEncode (positive
        only). Negative is unused — the model ignores it at CFG=1, so we just
        skip setting it.

    Other expected nodes:
      - 1x EmptyLatentImage / EmptySD3LatentImage (size).
      - 1x KSampler / KSamplerAdvanced (seed).
      - 1x SaveImage (filename_prefix).
    """
    wf = json.loads(json.dumps(workflow))  # deep copy

    clip_nodes = find_all_by_class(wf, "CLIPTextEncode")
    if len(clip_nodes) == 0:
        raise RuntimeError("No CLIPTextEncode nodes found in workflow")
    sorted_clip = sorted(clip_nodes, key=_node_id_key)
    # Convention: positive prompt is the first CLIPTextEncode by node-id order.
    pos_id = sorted_clip[0]
    wf[pos_id]["inputs"]["text"] = positive
    if len(sorted_clip) >= 2:
        neg_id = sorted_clip[1]
        wf[neg_id]["inputs"]["text"] = negative
    else:
        print(f"  [info] single CLIPTextEncode workflow (Turbo/schnell) — negative prompt ignored")

    latent_id = find_node_by_class(wf, "EmptyLatentImage") or find_node_by_class(
        wf, "EmptySD3LatentImage"
    )
    if latent_id:
        wf[latent_id]["inputs"]["width"] = width
        wf[latent_id]["inputs"]["height"] = height

    sampler_id = find_node_by_class(wf, "KSampler") or find_node_by_class(
        wf, "KSamplerAdvanced"
    )
    if sampler_id:
        # Both samplers expose `seed` (KSampler) or `noise_seed` (Advanced).
        if "seed" in wf[sampler_id]["inputs"]:
            wf[sampler_id]["inputs"]["seed"] = seed
        if "noise_seed" in wf[sampler_id]["inputs"]:
            wf[sampler_id]["inputs"]["noise_seed"] = seed

    save_id = find_node_by_class(wf, "SaveImage")
    if save_id:
        wf[save_id]["inputs"]["filename_prefix"] = save_prefix

    return wf


# ---- Driver ------------------------------------------------------------------
def run(args):
    root = Path(__file__).resolve().parent.parent
    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = root / manifest_path
    workflow_path = Path(args.workflow)
    if not workflow_path.is_absolute():
        workflow_path = root / workflow_path

    with open(workflow_path, "r", encoding="utf-8") as f:
        workflow_template = json.load(f)

    rows = list(csv.DictReader(open(manifest_path, encoding="utf-8")))

    # Filter
    if args.only:
        rows = [r for r in rows if r["type"] == args.only]
    if args.filter:
        rows = [r for r in rows if args.filter in r["output_path"]]

    client_id = str(uuid.uuid4())
    style_override = args.style  # None unless user passed --style
    preset = STYLE_PRESETS[args.preset]
    base_style = preset["base"] or BASE_STYLE_ZH
    prop_style = preset["prop"] or PROP_FULL_STYLE_ZH
    negative = args.negative or (DEFAULT_NEG + preset["extra_neg"])

    print(f"[batch] {len(rows)} rows to generate")
    print(f"[batch] Manifest: {manifest_path.name}   Preset: {args.preset}")
    print(f"[batch] ComfyUI at http://{args.host}")
    print(f"[batch] Workflow: {workflow_path.name}")
    print()

    ok, skipped, failed = 0, 0, 0
    for idx, row in enumerate(rows):
        out_rel = row["output_path"]
        out_abs = root / out_rel

        if args.skip_existing and out_abs.exists():
            print(f"[{idx+1:>2}/{len(rows)}] SKIP (exists)  {out_rel}")
            skipped += 1
            continue

        prompt = row["prompt"].strip()
        rtype = row["type"]
        is_prop = rtype == "prop"
        # Build style: unified base + per-type modifier (or full --style override).
        # Props use a completely separate style (no gongbi wording) — see
        # PROP_FULL_STYLE_ZH for why.
        if style_override:
            row_style = style_override
        elif is_prop:
            row_style = prop_style
        else:
            modifier = TYPE_MODIFIER.get(rtype, "")
            row_style = f"{base_style}, {modifier}" if modifier else base_style
        tail = PROP_TRANSPARENT_TAIL if is_prop else CHAR_TRANSPARENT_TAIL
        if row.get("transparent", "").lower() == "true":
            prompt = prompt + tail
        full_positive = f"{prompt}, {row_style}"
        # Props need stronger negatives to prevent figures/decoration on the object
        row_negative = negative + PROP_EXTRA_NEG if is_prop else negative

        width = int(row["width"])
        height = int(row["height"])
        seed = args.seed + idx

        # Use a unique filename_prefix per row so ComfyUI doesn't overwrite.
        # We'll move/rename the resulting file at the end.
        prefix = f"batch_{idx:03d}_{Path(out_rel).stem}"

        patched = patch_workflow(
            workflow_template,
            positive=full_positive,
            negative=row_negative,
            width=width,
            height=height,
            seed=seed,
            save_prefix=prefix,
        )

        try:
            prompt_id = post_prompt(args.host, patched, client_id)
            print(f"[{idx+1:>2}/{len(rows)}] queued {prompt_id[:8]}  {out_rel}")
            entry = wait_for_completion(args.host, prompt_id, timeout=args.timeout)
        except Exception as e:
            print(f"  ✗ FAILED: {e}")
            failed += 1
            continue

        # Find the output image in the history
        outputs = entry.get("outputs", {})
        image_info = None
        for nout in outputs.values():
            if "images" in nout and nout["images"]:
                image_info = nout["images"][0]
                break
        if image_info is None:
            print(f"  ✗ No image in outputs")
            failed += 1
            continue

        try:
            data = get_image(
                args.host,
                image_info["filename"],
                image_info.get("subfolder", ""),
                image_info.get("type", "output"),
            )
        except Exception as e:
            print(f"  ✗ download failed: {e}")
            failed += 1
            continue

        out_abs.parent.mkdir(parents=True, exist_ok=True)
        with open(out_abs, "wb") as f:
            f.write(data)
        print(f"  ✓ saved {len(data) // 1024} KB")
        ok += 1

    print()
    print(f"[done] ok={ok}  skipped={skipped}  failed={failed}  total={len(rows)}")


def main():
    p = argparse.ArgumentParser(description="Batch-generate game assets via ComfyUI.")
    p.add_argument("--workflow", default="scripts/comfy_workflow.json",
                   help="Path to ComfyUI workflow JSON in API format (export via 'Save (API Format)')")
    p.add_argument("--host", default="127.0.0.1:8188", help="ComfyUI host:port")
    p.add_argument("--manifest", default="scripts/assets_manifest.csv",
                   help="CSV manifest to read (e.g. scripts/assets_manifest_dante.csv)")
    p.add_argument("--preset", choices=list(STYLE_PRESETS), default="tang",
                   help="Style preset: tang (杜甫线工笔重彩) / dante (中世纪湿壁画+泥金抄本) / rumi (波斯细密画)")
    p.add_argument("--only", choices=["npc", "bg", "prop", "dufu", "dante", "rumi"], help="Filter by type")
    p.add_argument("--filter", help="Substring filter on output_path (e.g. '736')")
    p.add_argument("--skip-existing", action="store_true",
                   help="Skip rows whose output file already exists")
    p.add_argument("--style", help="Override style suffix (default: Tang ink-wash)")
    p.add_argument("--negative", help="Override negative prompt")
    p.add_argument("--seed", type=int, default=42, help="Base seed; each row uses seed + index")
    p.add_argument("--timeout", type=int, default=600,
                   help="Per-row timeout in seconds (default 600)")
    args = p.parse_args()
    run(args)


if __name__ == "__main__":
    main()
