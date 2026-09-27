// 鲁米线原型用的内联 SVG 小人和小物件（占位美术）。
// 正式版换成细密画立绘后，这些只作为「没有图时的兜底」保留。
// ———— 画：水果 ————
export function Fruit({ kind, size = 64 }) {
  if (kind === "grape") {
    const dots = [[32, 24], [22, 30], [42, 30], [27, 39], [37, 39], [32, 48], [18, 40], [46, 40], [32, 57]];
    return (
      <svg viewBox="0 0 64 70" width={size} height={size} aria-hidden="true">
        <path d="M32 6 C33 12 33 15 32 18" stroke="#6B4A2A" strokeWidth="3" fill="none" />
        <path d="M33 10 C42 3 52 6 54 12 C46 14 40 14 33 10 Z" fill="#6E8B3D" />
        {dots.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="7.2" fill={i % 3 ? "#5B2A6E" : "#6E3784"} stroke="#3C1848" strokeWidth="1" />)}
        {dots.map(([x, y], i) => <circle key={"h" + i} cx={x - 2.2} cy={y - 2.4} r="1.6" fill="rgba(255,255,255,0.45)" />)}
      </svg>
    );
  }
  if (kind === "fig") {
    return (
      <svg viewBox="0 0 64 70" width={size} height={size} aria-hidden="true">
        <path d="M32 8 C34 12 34 14 33 17" stroke="#5B4A2A" strokeWidth="3" fill="none" />
        <path d="M32 16 C22 18 12 34 14 48 C16 60 26 64 32 64 C38 64 48 60 50 48 C52 34 42 18 32 16 Z" fill="#6A3A52" stroke="#3E1F30" strokeWidth="1.5" />
        <path d="M24 30 C22 38 22 48 26 56" stroke="rgba(255,255,255,0.25)" strokeWidth="2.5" fill="none" />
      </svg>
    );
  }
  if (kind === "pomegranate") {
    return (
      <svg viewBox="0 0 64 70" width={size} height={size} aria-hidden="true">
        <circle cx="32" cy="40" r="22" fill="#B0302A" stroke="#6E1814" strokeWidth="1.5" />
        <path d="M24 18 L27 12 L30 17 L32 10 L34 17 L37 12 L40 18 Z" fill="#8E2420" />
        <path d="M20 34 C20 28 24 24 30 23" stroke="rgba(255,255,255,0.35)" strokeWidth="3" fill="none" />
      </svg>
    );
  }
  // melon
  return (
    <svg viewBox="0 0 64 70" width={size} height={size} aria-hidden="true">
      <ellipse cx="32" cy="40" rx="27" ry="21" fill="#C9B64A" stroke="#6E6420" strokeWidth="1.5" />
      {[-14, -5, 5, 14].map((d) => <path key={d} d={`M${32 + d} 20 C${32 + d * 1.6} 32 ${32 + d * 1.6} 48 ${32 + d} 60`} stroke="#8E8A2E" strokeWidth="2" fill="none" />)}
      <path d="M31 19 C31 15 33 13 35 12" stroke="#5B4A2A" strokeWidth="2.5" fill="none" />
    </svg>
  );
}

// ———— 画：人（剪影式，占位；正式版换细密画立绘） ————
// hat: turban | headcloth | furcap | pilos | bigturban | feltcap | veil | kippah | hood | none
// beard: 默认有（pilos / veil 默认没有）；beardColor 可设花白
export function Traveler({ hat, color, mood, beard, beardColor = "#3E2A1E", cloth }) {
  const hasBeard = beard !== undefined ? beard : !(hat === "pilos" || hat === "veil");
  const mouth = mood === "happy"
    ? <path d="M43 52 Q50 58 57 52" stroke="#3A2418" strokeWidth="2.2" fill="none" />
    : mood === "no"
      ? <path d="M43 56 Q50 51 57 56" stroke="#3A2418" strokeWidth="2.2" fill="none" />
      : mood === "calm"
        ? <path d="M44 54 L56 54" stroke="#3A2418" strokeWidth="2" fill="none" />
        : <ellipse cx="50" cy="54" rx="4.5" ry={mood === "shout" ? 4.5 : 2} fill="#3A2418" />;
  const drape = (fill, stroke) => <path d="M26 44 C26 20 74 20 74 44 L80 100 C70 92 64 88 60 86 L40 86 C36 88 30 92 20 100 Z" fill={fill} stroke={stroke} strokeWidth="1.2" />;
  return (
    <svg viewBox="0 0 100 150" width="100%" height="100%" aria-hidden="true">
      <path d="M18 150 C20 104 32 84 50 84 C68 84 80 104 82 150 Z" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      {hat === "headcloth" && drape("#E9E2D0", "#8C8272")}
      {hat === "veil" && drape(cloth || "#8A3A3A", "rgba(0,0,0,0.35)")}
      {hat === "hood" && drape(cloth || "#24201E", "#000")}
      <circle cx="50" cy="46" r="20" fill="#C89B72" />
      {hasBeard && <path d="M32 52 C34 70 66 70 68 52 C62 60 38 60 32 52 Z" fill={beardColor} />}
      <circle cx="43" cy="43" r="2.2" fill="#2A1C12" /><circle cx="57" cy="43" r="2.2" fill="#2A1C12" />
      {mouth}
      {hat === "turban" && <g><ellipse cx="50" cy="28" rx="25" ry="13" fill="#F1EBDD" stroke="#9C9180" strokeWidth="1.2" /><path d="M28 30 C40 22 60 22 72 30" stroke="#C9BFA8" strokeWidth="2" fill="none" /><circle cx="50" cy="18" r="3.5" fill="#B4762F" /></g>}
      {hat === "bigturban" && <g><ellipse cx="50" cy="24" rx="30" ry="18" fill="#F4EFE4" stroke="#9C9180" strokeWidth="1.2" /><path d="M24 26 C38 16 62 16 76 26 M26 32 C40 24 60 24 74 32" stroke="#CFC6B2" strokeWidth="2" fill="none" /></g>}
      {hat === "headcloth" && <path d="M28 30 C38 26 62 26 72 30" stroke="#2A2420" strokeWidth="4" fill="none" />}
      {hat === "furcap" && <path d="M30 34 C28 10 72 10 70 34 Z" fill="#6B4A2E" stroke="#3E2A18" strokeWidth="1.2" />}
      {hat === "pilos" && <path d="M34 32 C34 18 66 18 66 32 Z" fill="#7A3A4A" stroke="#4A1E2A" strokeWidth="1.2" />}
      {hat === "feltcap" && <path d="M33 34 L42 4 L58 4 L67 34 Z" fill="#221E1C" stroke="#000" strokeWidth="1.2" />}
      {hat === "kippah" && <path d="M38 30 C40 22 60 22 62 30 Z" fill="#2E3A5A" />}
    </svg>
  );
}
