import type { ThemeId } from "@memora/shared";
import { illustration } from "./album-illustrations";
import type { AlbumSlot, AlbumTheme } from "./album-theme";

export interface DemoPhoto {
  id: string;
  alt: string;
  src: string;
  caption: string;
}

export interface DemoBeat {
  label: string;
  text: string;
}

export interface FilledSlot {
  id: string;
  type: string;
  hint: string | null;
  kicker: string;
  title: string;
  body: string;
  photos: DemoPhoto[];
  beats: DemoBeat[];
}

export interface DemoAlbum {
  title: string;
  subtitle: string;
  slots: FilledSlot[];
}

interface SlotCopy {
  kicker: string;
  title: string;
  body: string;
  photos?: Array<{ alt: string; caption: string }>;
  beats?: DemoBeat[];
}

const COPY: Record<ThemeId, Record<string, SlotCopy>> = {
  "cotton-candy": {
    cover: {
      kicker: "棉花糖日记",
      title: "春天还没走",
      body: "窗台上的第一束光，先被我们收进封面。",
      photos: [{ alt: "窗边的两只杯子和一盆绿植", caption: "窗台上的第一束光" }],
    },
    days: {
      kicker: "在一起的天数",
      title: "从那杯热可可开始",
      body: "在一起 1,286 天。日子软下来以后，连页边都是甜的。",
    },
    "spread-a": {
      kicker: "对页",
      title: "一个周末",
      body: "左边是厨房，右边是晚风。",
      photos: [
        { alt: "两只靠在一起的杯子", caption: "周日厨房" },
        { alt: "草坪上的两辆自行车", caption: "晚风里的车" },
      ],
    },
    polaroid: {
      kicker: "拍立得墙",
      title: "随手贴上的",
      body: "不按顺序，只按想你的时候。",
      photos: [
        { alt: "三层小蛋糕", caption: "下午茶" },
        { alt: "一束圆圆的花", caption: "路过花店" },
        { alt: "一只浅色信封", caption: "没寄出的信" },
        { alt: "夜里的小灯", caption: "熄灯以前" },
        { alt: "野餐垫上的点心", caption: "草地" },
        { alt: "一台小相机", caption: "你按下的" },
      ],
    },
    note: {
      kicker: "页边笔记",
      title: "先翻到这里也没关系",
      body: "如果你先翻到这里，说明你也想我了。这一行是写给你的。",
    },
    timeline: {
      kicker: "我们的时间",
      title: "三枚书签",
      body: "厚的日子不多，薄的日子都很喜欢。",
      beats: [
        { label: "2023.02", text: "初见。可可见底的时候，名字也记住了。" },
        { label: "2024.08", text: "第一次把两个人的照片放进同一本。" },
        { label: "今天", text: "这一页还热着。" },
      ],
    },
    closing: {
      kicker: "未完",
      title: "下一页先空着",
      body: "留给下次见面。你可以先把心形贴纸贴好。",
    },
  },
  "kyoto-lantern": {
    cover: {
      kicker: "京都 · 夜",
      title: "祗园，灯刚点上",
      body: "夜色里一盏灯，把旅途收成封面。",
      photos: [{ alt: "夜色街道上的三盏纸灯", caption: "灯刚点上" }],
    },
    map: {
      kicker: "今夜的路",
      title: "从三条走到鸭川",
      body: "不靠导航，靠灯。",
      beats: [
        { label: "三条", text: "放下行李，纸门还带着白天的温度。" },
        { label: "二年坂", text: "灯笼一盏接一盏，石阶发亮。" },
        { label: "清水坂", text: "回头看，城里只剩一小块暖色。" },
        { label: "鸭川", text: "水声把脚步声盖住了。" },
      ],
    },
    "spread-a": {
      kicker: "对页",
      title: "巷与河",
      body: "左边是窗，右边是水。",
      photos: [
        { alt: "夜里的木屋窗格", caption: "二年坂" },
        { alt: "月色下的河面", caption: "鸭川" },
      ],
    },
    "stamp-wall": {
      kicker: "邮票墙",
      title: "盖过章的夜晚",
      body: "每张都想寄走，又都舍不得。",
      photos: [
        { alt: "寺院屋顶的剪影", caption: "高台寺" },
        { alt: "一枚虚线邮票", caption: "纪念印" },
        { alt: "撕下的车票票根", caption: "票根" },
        { alt: "一排灯笼", caption: "先斗町" },
        { alt: "桥的弧线", caption: "三条大桥" },
        { alt: "暖色的屋台", caption: "屋台" },
      ],
    },
    letter: {
      kicker: "纸灯下的信",
      title: "写在灯还亮着的时候",
      body: "今晚的路不长，可我还是想把每一盏灯都记给你。回到住处时，纸门上有你的影子。",
    },
    timeline: {
      kicker: "行程",
      title: "三班灯",
      body: "抵达、夜访、回程。",
      beats: [
        { label: "黄昏", text: "电车进站，空气先凉下来。" },
        { label: "夜", text: "纸灯替路牌说话。" },
        { label: "清晨", text: "把这页合上，灯还在。" },
      ],
    },
    closing: {
      kicker: "回程",
      title: "灯还亮着",
      body: "这本先停在这里。下一趟夜路，仍从这一页接着走。",
    },
  },
  "magazine-heirloom": {
    cover: {
      kicker: "Issue 04",
      title: "Heirloom",
      body: "一本只关于你们的杂志。封面不解释，只留下一张够用很久的照片。",
      photos: [{ alt: "黑白肖像构图，肩线与金色块", caption: "封面故事" }],
    },
    toc: {
      kicker: "目录",
      title: "Contents",
      body: "封面故事、对页、满版、引语、六格，然后是刊末。没有广告。",
      beats: [
        { label: "02", text: "对页 · 人物与器物" },
        { label: "04", text: "满版 · 天光" },
        { label: "06", text: "引语" },
        { label: "08", text: "六格编辑" },
      ],
    },
    "spread-a": {
      kicker: "对页",
      title: "人物 / 器物",
      body: "左页看人，右页看他留下的位置。",
      photos: [
        { alt: "圆形剪影与直线衣襟", caption: "人物" },
        { alt: "一把只有骨架的椅子", caption: "器物" },
      ],
    },
    "full-bleed": {
      kicker: "满版",
      title: "天光只留一条",
      body: "这一张不留白边。",
      photos: [{ alt: "横幅风景，地平线压得很低", caption: "Plate 04" }],
    },
    "pull-quote": {
      kicker: "引语",
      title: "Pull quote",
      body: "我们把日子排成栏，好让以后的人读得慢一点。",
    },
    grid: {
      kicker: "六格",
      title: "编辑选片",
      body: "六张，不多。每张都站得住自己的格子。",
      photos: [
        { alt: "四块色面拼成的版面", caption: "01 色面" },
        { alt: "四根高低不同的竖条", caption: "02 竖条" },
        { alt: "一只细颈瓶子", caption: "03 瓶" },
        { alt: "深色底上的矩形", caption: "04 暗格" },
        { alt: "线框里的色块", caption: "05 线" },
        { alt: "一道拱门", caption: "06 拱" },
      ],
    },
    closing: {
      kicker: "Colophon",
      title: "刊末",
      body: "念册 · Memora 样张。这一期没有下一期的预告，只有你们自己的下一张照片。",
    },
  },
};

function photoCount(slot: AlbumSlot): number {
  if (slot.type === "spread-2") return 2;
  if (slot.type === "hero") return 1;
  if (slot.type === "polaroid-wall") {
    const min = slot.min ?? 4;
    const max = slot.max ?? Math.max(min, 6);
    return Math.min(max, Math.max(min, 6));
  }
  return 0;
}

function fallbackCopy(slot: AlbumSlot): SlotCopy {
  return {
    kicker: slot.hint ?? slot.id,
    title: slot.hint ?? slot.id,
    body: "这一页按模板槽位留白。",
    photos:
      slot.type === "hero" || slot.type === "spread-2" || slot.type === "polaroid-wall"
        ? Array.from({ length: photoCount(slot) }, (_, index) => ({
            alt: `${slot.id} 示例图片 ${index + 1}`,
            caption: `示例 ${index + 1}`,
          }))
        : undefined,
  };
}

/** 用模板槽位填一册样张。图片是内联 SVG，不读取用户上传。 */
export function buildDemoAlbum(theme: AlbumTheme): DemoAlbum {
  const themeId = theme.skin.id;
  const presets = COPY[themeId];
  let scene = 0;
  const slots = theme.slots.map((slot) => {
    const copy = presets[slot.id] ?? fallbackCopy(slot);
    const wanted = photoCount(slot);
    const sources = copy.photos ?? [];
    const photos: DemoPhoto[] = [];
    for (let index = 0; index < wanted; index += 1) {
      const source = sources[index] ?? {
        alt: `${theme.skin.name} 示例图片 ${index + 1}`,
        caption: `示例 ${index + 1}`,
      };
      photos.push({
        id: `${themeId}-${slot.id}-${index}`,
        alt: source.alt,
        caption: source.caption,
        src: illustration(themeId, scene),
      });
      scene += 1;
    }
    return {
      id: slot.id,
      type: slot.type,
      hint: slot.hint,
      kicker: copy.kicker,
      title: copy.title,
      body: copy.body,
      photos,
      beats: copy.beats ?? [],
    };
  });
  return {
    title: theme.shareTitle,
    subtitle: theme.shareSubtitle,
    slots,
  };
}
