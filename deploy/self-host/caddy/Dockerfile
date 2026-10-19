# syntax=docker/dockerfile:1
# 官方 Caddy 没有限流。这里按 deploy/self-host/proxy 里的片段编进 caddy-ratelimit。
# v0.1.0 还没有 zone 里的 match，所以钉在已支持该语法的提交上。

ARG CADDY_VERSION=2.11.7
FROM caddy:${CADDY_VERSION}-builder AS builder
ARG CADDY_VERSION
ARG RATELIMIT_COMMIT=16aecbbcb8ca07dc1c671e263379606ff9493c55
RUN xcaddy build "v${CADDY_VERSION}" \
    --output /usr/bin/caddy \
    --with "github.com/mholt/caddy-ratelimit@${RATELIMIT_COMMIT}" \
    && caddy list-modules | grep -qx 'http.handlers.rate_limit'

FROM caddy:${CADDY_VERSION}
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
USER root
# 换过二进制后文件能力会丢。caddy 用户要靠它绑定 80/443。
RUN apk add --no-cache wget libcap \
    && setcap cap_net_bind_service=+ep /usr/bin/caddy \
    && mkdir -p /var/log/caddy \
    && chown caddy:caddy /var/log/caddy \
    && chmod 750 /var/log/caddy
USER caddy
EXPOSE 80 443
