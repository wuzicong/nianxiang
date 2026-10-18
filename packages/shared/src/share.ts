/** 32 字节 base64url、无填充，固定 43 个字符。库里只存 sha256，不明文落盘。 */
export const SHARE_TOKEN_LENGTH = 43;

const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN_PATTERN.test(value);
}

/** 分享页路径。明文 token 只应出现在创建响应和这个链接里。 */
export function sharePagePath(token: string): string {
  return `/s/${token}`;
}
