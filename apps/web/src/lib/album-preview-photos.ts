import type { DemoAlbum, DemoPhoto } from "./album-demo";

/** Story 滚动顺序：按槽位顺序收集有 id 的照片，供灯箱前后切换。 */
export function orderedAlbumPhotos(album: DemoAlbum): DemoPhoto[] {
  const seen = new Set<string>();
  const list: DemoPhoto[] = [];
  for (const slot of album.slots) {
    for (const photo of slot.photos) {
      if (!photo?.id || seen.has(photo.id)) continue;
      seen.add(photo.id);
      list.push(photo);
    }
  }
  return list;
}
