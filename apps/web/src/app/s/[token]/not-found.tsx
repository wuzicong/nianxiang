import { ShareStatus } from "../share-status";

export default function ShareNotFound() {
  return (
    <ShareStatus
      title="分享不存在"
      body="链接无效、已过期，或已被撤销。"
    />
  );
}
