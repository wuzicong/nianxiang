import { HttpError } from "../http.js";

/**
 * 外部身份挂点。邮箱密码和将来的 OIDC 都应走同一张 sessions 表与 Cookie。
 * 本阶段不校验授权码、PKCE 或 id_token，也不接任何 IdP。
 */
export interface OidcIdentityClaims {
  issuer: string;
  subject: string;
  email: string;
}

export function oidcNotEnabled(): HttpError {
  return new HttpError(501, "oidc_not_enabled", "OIDC 登录尚未启用");
}

/** 校验完 id_token 之后应调用它来发会话。现在还没有校验器，调用即拒绝。 */
export function beginOidcSession(claims: OidcIdentityClaims): never {
  void claims;
  throw oidcNotEnabled();
}
