// 画作卡：揭示之后给玩家看一幅真实的古画（公有领域），下面挂一行墙签。
// 墙签从 src/data/artworks.json 按 artKey（资产路径）查，和但丁线的 ArtworkLabel 同一张表。
// 图还没放进 public/ 时（加载失败）整张卡不显示——不会留一个破图。
//
// 用法：phase.artCard = { src: "/assets/rumi/art/xxx.webp", artKey: "/assets/rumi/art/xxx.webp" }
//（artKey 单独写一份，是因为单文件试玩页会把 src 换成 data: URI，查表要用原路径。）
import { useState } from "react";
import { asset } from "../../utils/asset";
import { artworkFor } from "../ArtworkLabel";
import { t } from "../../i18n/ui";

export default function ArtCard({ src, style }) {
  const [broken, setBroken] = useState(false);
  const conf = typeof src === "string" ? { src, artKey: src } : (src || {});
  if (!conf.src || broken) return null;
  const art = artworkFor(conf.artKey || conf.src);
  const line = art ? [t(art.title), t(art.artist), t(art.year), art.holder && t(art.holder), t(art.license)].filter(Boolean).join(" · ") : "";
  return (
    <figure style={{ ...ac.fig, ...style }}>
      <img src={asset(conf.src)} alt={art ? art.title : ""} style={ac.img} onError={() => setBroken(true)} />
      {line && <figcaption style={ac.cap}>{line}</figcaption>}
    </figure>
  );
}

const ac = {
  fig: {
    margin: "2px 0 0", display: "flex", flexDirection: "column", alignItems: "center",
    gap: 8, maxWidth: "min(94vw, 980px)", width: "100%",
  },
  // 画要看得清才有意义：原来 24vh + 6px 奶油硬边，读起来是一张贴上去的明信片。
  // 现在放大到近一倍、去掉硬边框，边缘用遮罩淡出——画化进底图，而不是压在上面。
  img: {
    maxWidth: "100%", maxHeight: "58vh", objectFit: "contain",
    borderRadius: 6,
    WebkitMaskImage:
      "radial-gradient(120% 120% at 50% 45%, #000 62%, rgba(0,0,0,0.65) 82%, rgba(0,0,0,0) 100%)",
    maskImage:
      "radial-gradient(120% 120% at 50% 45%, #000 62%, rgba(0,0,0,0.65) 82%, rgba(0,0,0,0) 100%)",
    filter: "drop-shadow(0 10px 30px rgba(0,0,0,0.55))",
  },
  cap: {
    color: "rgba(233,220,194,0.78)", fontSize: 12, lineHeight: 1.5, letterSpacing: 1,
    textAlign: "center", maxWidth: 720,
  },
};
