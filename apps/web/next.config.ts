import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@memora/shared"],
  // `next dev` 会把完整请求路径打到终端。分享令牌就在 /s/ 和公开接口路径里。
  logging: {
    incomingRequests: {
      ignore: [/^\/s\//, /^\/api\/v1\/public\/shares\//],
    },
  },
};

export default nextConfig;
