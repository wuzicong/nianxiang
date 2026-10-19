import type { ThemeId } from "@memora/shared";

function svg(width: number, height: number, body: string): string {
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${body}</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(markup)}`;
}

function rect(x: number, y: number, w: number, h: number, fill: string, rx = 0): string {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
}

function circle(cx: number, cy: number, r: number, fill: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
}

const cottonScenes = [
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F3C7BE"),
        circle(650, 160, 88, "#C9B8E8"),
        rect(150, 190, 500, 560, "#FFF8F5", 36),
        rect(190, 240, 190, 220, "#C9D7B8", 12),
        rect(410, 240, 190, 220, "#F7D7D2", 12),
        rect(190, 490, 410, 190, "#E7EEF8", 12),
        circle(250, 820, 48, "#F5C6C6"),
        circle(360, 836, 36, "#C9B8E8"),
        rect(470, 790, 16, 90, "#2C2A29", 8),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F7EDE2"),
        rect(0, 620, 800, 380, "#E7D3C5"),
        circle(230, 470, 110, "#FFF8F5"),
        circle(230, 500, 70, "#C9B8E8"),
        circle(520, 430, 130, "#F5C6C6"),
        circle(520, 470, 78, "#FFF8F5"),
        rect(180, 250, 90, 18, "#B7C4A3", 9),
        rect(470, 210, 110, 18, "#C9B8E8", 9),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#E7F0E4"),
        circle(400, 210, 70, "#F5C6C6"),
        circle(180, 760, 90, "#2C2A29"),
        circle(180, 760, 28, "#FFF8F5"),
        circle(560, 700, 90, "#2C2A29"),
        circle(560, 700, 28, "#FFF8F5"),
        rect(150, 620, 460, 28, "#C9B8E8", 14),
        rect(250, 430, 280, 24, "#2C2A29", 12),
        circle(250, 500, 36, "#F5C6C6"),
        circle(520, 470, 36, "#B7C4A3"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F8E7EF"),
        rect(210, 520, 380, 180, "#FFF8F5", 20),
        rect(240, 390, 320, 140, "#F5C6C6", 18),
        rect(280, 270, 240, 130, "#C9B8E8", 18),
        circle(400, 250, 28, "#B7C4A3"),
        rect(360, 700, 80, 120, "#E7D3C5", 8),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F7EDE2"),
        circle(260, 360, 120, "#F5C6C6"),
        circle(430, 300, 90, "#C9B8E8"),
        circle(520, 450, 110, "#B7C4A3"),
        circle(340, 500, 70, "#FFF8F5"),
        rect(370, 560, 18, 280, "#8A8279", 8),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F3E4F2"),
        rect(160, 260, 480, 320, "#FFF8F5", 18),
        `<path d="M160 260l240 160 240-160" stroke="#C9B8E8" stroke-width="16" fill="none"/>`,
        circle(560, 700, 70, "#F5C6C6"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#2C2A4A"),
        circle(560, 220, 80, "#F7EDE2"),
        circle(590, 200, 80, "#2C2A4A"),
        circle(180, 300, 6, "#FFF8F5"),
        circle(260, 180, 4, "#FFF8F5"),
        circle(420, 260, 5, "#F5C6C6"),
        rect(220, 640, 360, 160, "#C9B8E8", 28),
        circle(400, 720, 36, "#F5C6C6"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F7E3C4"),
        rect(80, 560, 640, 280, "#B7C4A3", 24),
        circle(250, 500, 70, "#F5C6C6"),
        circle(430, 470, 54, "#FFF8F5"),
        circle(560, 520, 64, "#C9B8E8"),
        rect(300, 680, 200, 16, "#FFF8F5", 8),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#EADFD6"),
        rect(230, 250, 340, 260, "#2C2A29", 28),
        circle(400, 380, 78, "#C9B8E8"),
        circle(400, 380, 36, "#2C2A29"),
        rect(300, 540, 200, 36, "#F5C6C6", 8),
        rect(360, 600, 80, 140, "#8A8279", 8),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F8D5D5"),
        `<path d="M400 760s-150-96-200-184c-42-74-8-150 70-150 48 0 82 32 130 74 48-42 82-74 130-74 78 0 112 76 70 150-50 88-200 184-200 184z" fill="#F5C6C6" stroke="#C9B8E8" stroke-width="14"/>`,
        circle(250, 240, 40, "#FFF8F5"),
        circle(560, 280, 26, "#B7C4A3"),
      ].join(""),
    ),
];

const kyotoScenes = [
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#141414"),
        rect(0, 760, 800, 240, "#242422"),
        rect(150, 250, 70, 360, "#C2A878"),
        rect(170, 210, 30, 50, "#3A3530"),
        rect(360, 180, 90, 470, "#F5C6C6"),
        rect(385, 140, 40, 50, "#C2A878"),
        rect(560, 300, 64, 300, "#C2A878"),
        circle(400, 120, 28, "#FAFAF7"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#1C1916"),
        rect(90, 180, 140, 560, "#2A2622"),
        rect(280, 120, 160, 640, "#3A3530"),
        rect(500, 240, 180, 500, "#242422"),
        rect(120, 300, 70, 90, "#C2A878"),
        rect(330, 250, 70, 110, "#F5C6C6"),
        rect(560, 360, 80, 70, "#C2A878"),
        rect(0, 780, 800, 220, "#12110F"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#101820"),
        rect(0, 620, 800, 380, "#1A242C"),
        `<path d="M40 620c120 40 180-20 280 10 90 28 140-40 240-10 80 24 140 8 200-20v400H40V620z" fill="#C2A878" fill-opacity="0.35"/>`,
        circle(620, 180, 54, "#FAFAF7"),
        rect(180, 430, 16, 190, "#3A3530"),
        rect(360, 390, 16, 230, "#3A3530"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#211C18"),
        `<path d="M80 620 L400 220 L720 620 Z" fill="#3A3530"/>`,
        `<path d="M160 620 L400 300 L640 620 Z" fill="#C2A878"/>`,
        rect(330, 620, 140, 220, "#242422"),
        rect(0, 820, 800, 180, "#141210"),
        circle(400, 150, 22, "#F5C6C6"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#1A1A1A"),
        rect(140, 180, 520, 640, "#242422"),
        rect(140, 180, 520, 640, "none"),
        `<rect x="160" y="200" width="480" height="600" fill="none" stroke="#C2A878" stroke-width="10" stroke-dasharray="18 12"/>`,
        circle(400, 500, 120, "none"),
        `<circle cx="400" cy="470" r="110" fill="none" stroke="#F5C6C6" stroke-width="8"/>`,
        rect(250, 700, 300, 10, "#C2A878"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#2A2420"),
        rect(120, 280, 560, 280, "#242422"),
        `<path d="M120 280h430c0 28 22 42 22 70s-22 42-22 70 22 42 22 70-22 42-22 70H120z" fill="#1A1A1A" stroke="#C2A878" stroke-width="8"/>`,
        rect(180, 390, 260, 8, "#F5C6C6"),
        circle(210, 350, 10, "#C2A878"),
        circle(250, 350, 10, "#C2A878"),
        circle(290, 350, 10, "#C2A878"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#120E0C"),
        rect(200, 160, 28, 680, "#3A3530"),
        rect(390, 80, 28, 760, "#3A3530"),
        rect(560, 220, 28, 620, "#3A3530"),
        circle(214, 150, 40, "#F5C6C6"),
        circle(404, 70, 48, "#C2A878"),
        circle(574, 210, 36, "#F5C6C6"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#1A1A1A"),
        `<path d="M80 780h640" stroke="#C2A878" stroke-width="8"/>`,
        `<path d="M120 780c40-180 80-180 120 0" stroke="#FAFAF7" stroke-width="8" fill="none"/>`,
        `<path d="M300 780c50-240 110-240 160 0" stroke="#F5C6C6" stroke-width="8" fill="none"/>`,
        `<path d="M520 780c36-140 80-140 110 0" stroke="#C2A878" stroke-width="8" fill="none"/>`,
        circle(640, 180, 36, "#FAFAF7"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#241810"),
        rect(180, 260, 440, 360, "#C45A3A"),
        rect(220, 320, 360, 40, "#F5C6C6"),
        rect(220, 400, 220, 18, "#C2A878"),
        rect(220, 450, 280, 18, "#FAFAF7"),
        rect(300, 680, 200, 24, "#3A3530"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#101010"),
        rect(250, 80, 300, 70, "#C2A878"),
        rect(180, 150, 440, 620, "#F5C6C6"),
        rect(230, 230, 340, 460, "#1A1A1A"),
        circle(400, 460, 70, "#C2A878"),
      ].join(""),
    ),
];

const magazineScenes = [
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F4F1EA"),
        rect(180, 120, 440, 760, "#1A1A1A"),
        circle(400, 390, 120, "#FAFAF7"),
        rect(300, 560, 200, 220, "#C2A878"),
        rect(60, 80, 40, 840, "#E8E4DE"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#E7E2DA"),
        circle(400, 340, 150, "#1A1A1A"),
        rect(250, 500, 300, 360, "#FAFAF7"),
        rect(330, 500, 140, 280, "#C2A878"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F7F4EE"),
        rect(160, 620, 480, 28, "#1A1A1A"),
        rect(220, 300, 28, 320, "#1A1A1A"),
        rect(400, 220, 28, 400, "#1A1A1A"),
        rect(540, 360, 28, 260, "#C2A878"),
        rect(250, 250, 300, 16, "#1A1A1A"),
      ].join(""),
    ),
  () =>
    svg(
      1200,
      800,
      [
        rect(0, 0, 1200, 800, "#D9D3C8"),
        rect(0, 460, 1200, 340, "#1A1A1A"),
        rect(0, 430, 1200, 12, "#C2A878"),
        circle(860, 220, 90, "#FAFAF7"),
        rect(120, 180, 220, 160, "#E8E4DE"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F3F0EA"),
        rect(80, 80, 300, 380, "#1A1A1A"),
        rect(420, 80, 300, 240, "#C2A878"),
        rect(420, 360, 300, 240, "#E8E4DE"),
        rect(80, 500, 640, 360, "#FAFAF7"),
        rect(140, 580, 220, 12, "#1A1A1A"),
        rect(140, 620, 360, 8, "#6F6A63"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#EFEAE3"),
        rect(140, 140, 80, 720, "#1A1A1A"),
        rect(280, 220, 80, 640, "#1A1A1A"),
        rect(420, 300, 80, 560, "#C2A878"),
        rect(560, 180, 80, 680, "#1A1A1A"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F7F5F1"),
        circle(400, 430, 180, "#E8E4DE"),
        `<path d="M280 700h240l-40 160h-160z" fill="#1A1A1A"/>`,
        rect(370, 620, 60, 90, "#C2A878"),
        circle(400, 390, 46, "#FAFAF7"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#1A1A1A"),
        rect(70, 70, 300, 400, "#FAFAF7"),
        rect(420, 70, 310, 250, "#C2A878"),
        rect(420, 360, 310, 250, "#E8E4DE"),
        rect(70, 520, 660, 360, "#2A2A2A"),
        rect(120, 600, 280, 10, "#FAFAF7"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#F4F1EB"),
        `<path d="M120 180h560v520H120z" fill="none" stroke="#1A1A1A" stroke-width="8"/>`,
        rect(180, 250, 180, 180, "#1A1A1A"),
        rect(400, 250, 220, 80, "#C2A878"),
        rect(400, 360, 220, 70, "#E8E4DE"),
        rect(180, 470, 440, 140, "#FAFAF7"),
      ].join(""),
    ),
  () =>
    svg(
      800,
      1000,
      [
        rect(0, 0, 800, 1000, "#E6E1D8"),
        `<path d="M140 860V360c80-160 180-220 260-220s180 60 260 220v500H140z" fill="#FAFAF7"/>`,
        `<path d="M140 860V360c80-160 180-220 260-220s180 60 260 220" fill="none" stroke="#1A1A1A" stroke-width="8"/>`,
        rect(360, 520, 80, 340, "#C2A878"),
      ].join(""),
    ),
];

const SCENES: Record<ThemeId, Array<() => string>> = {
  "cotton-candy": cottonScenes,
  "kyoto-lantern": kyotoScenes,
  "magazine-heirloom": magazineScenes,
};

export function illustration(themeId: ThemeId, scene: number): string {
  const scenes = SCENES[themeId];
  const paint = scenes[scene % scenes.length] ?? scenes[0];
  return paint();
}
