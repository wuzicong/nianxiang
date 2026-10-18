import { headers } from "next/headers";
import { DEFAULT_THEME_ID } from "@memora/shared";
import { SHARE_THEME_HEADER } from "../../../lib/share-theme-header";
import { themeIdFromHint, themeSkin } from "../../../lib/themes";
import { ShareStatus } from "../share-status";

export default async function ShareNotFound() {
  const hinted = themeIdFromHint((await headers()).get(SHARE_THEME_HEADER));
  return (
    <ShareStatus
      title="分享不存在"
      body="链接无效、已过期，或已被撤销。"
      theme={themeSkin(hinted ?? DEFAULT_THEME_ID)}
    />
  );
}
