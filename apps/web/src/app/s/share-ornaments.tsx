import type { ThemeId } from "@memora/shared";

/** Shell 纹理层：cotton=grain · kyoto=paper · heirloom=无满屏纹 */
export function ShareTexture({ themeId }: { themeId: ThemeId }) {
  if (themeId === "magazine-heirloom") return null;
  const variant = themeId === "cotton-candy" ? "grain" : "paper";
  return <div className={`share-texture share-texture-${variant}`} aria-hidden="true" />;
}

export function ShareBackdrop({ themeId }: { themeId: ThemeId }) {
  return (
    <div className="share-backdrop" aria-hidden="true">
      {themeId === "cotton-candy" ? (
        <>
          <SoftBlob className="share-blob share-blob-a" />
          <SoftBlob className="share-blob share-blob-b" />
        </>
      ) : null}
      {themeId === "kyoto-lantern" ? (
        <>
          <Lantern className="share-lantern" />
          <PostageStamp className="share-stamp" />
          <TicketStub className="share-ticket" />
        </>
      ) : null}
    </div>
  );
}

export function ShareCardDecor({ themeId }: { themeId: ThemeId }) {
  if (themeId === "cotton-candy") {
    return (
      <div className="share-motif" aria-hidden="true">
        <WashiTape />
        <HeartSticker />
      </div>
    );
  }
  if (themeId === "kyoto-lantern") {
    return (
      <div className="share-washi-edge" aria-hidden="true">
        <WashiEdge />
      </div>
    );
  }
  return (
    <div className="share-folio" aria-hidden="true">
      <PageNumber />
    </div>
  );
}

function SoftBlob({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 180" fill="none">
      <path
        d="M48 96c2-42 36-74 74-64 20 5 30-14 52-8 30 8 46 46 36 74-10 32-28 52-62 58-40 7-102-12-100-60z"
        fill="#F5C6C6"
      />
      <path
        d="M78 78c16-30 62-22 72 8 8 24-12 44-38 40-24-4-48-16-34-48z"
        fill="#C9B8E8"
        fillOpacity="0.85"
      />
    </svg>
  );
}

function HeartSticker() {
  return (
    <svg className="share-heart-mark" viewBox="0 0 64 64" fill="none">
      <path
        d="M32 54s-18-11.5-24-22C3.5 24 8 14 18 14c6 0 10 4 14 9 4-5 8-9 14-9 10 0 14.5 10 10 18-6 10.5-24 22-24 22z"
        fill="#F5C6C6"
        stroke="#C9B8E8"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function WashiTape() {
  return (
    <svg className="share-tape-mark" viewBox="0 0 120 28" fill="none">
      <rect x="1" y="4" width="118" height="20" rx="2" fill="#C9B8E8" fillOpacity="0.72" />
      <path d="M1 8h118M1 20h118" stroke="#F5C6C6" strokeWidth="1" strokeDasharray="3 4" />
    </svg>
  );
}

function Lantern({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 72" fill="none">
      <rect x="18" y="4" width="12" height="6" rx="1" fill="var(--share-accent)" />
      <path d="M10 14h28l-3 36H13L10 14z" fill="#F5C6C6" fillOpacity="0.9" />
      <ellipse cx="24" cy="32" rx="10" ry="14" fill="var(--share-accent)" fillOpacity="0.38" />
      <rect x="22" y="50" width="4" height="14" rx="1" fill="var(--share-accent)" />
    </svg>
  );
}

function PostageStamp({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 72 72" fill="none">
      <rect
        x="6"
        y="6"
        width="60"
        height="60"
        fill="#242422"
        stroke="var(--share-accent)"
        strokeWidth="2"
        strokeDasharray="4 3"
      />
      <circle cx="36" cy="36" r="14" stroke="#F5C6C6" strokeWidth="1.5" />
    </svg>
  );
}

function TicketStub({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 148 64" fill="none">
      <path
        d="M6 8h104c0 5 4 8 4 12s-4 7-4 12 4 7 4 12-4 7-4 12H6a4 4 0 0 1-4-4V12a4 4 0 0 1 4-4z"
        fill="#242422"
        stroke="var(--share-accent)"
      />
      <path d="M110 8h28a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4h-28" stroke="var(--share-accent)" />
      <path d="M110 10v44" stroke="var(--share-accent)" strokeDasharray="2 3" />
      <path d="M22 32h52" stroke="#F5C6C6" strokeWidth="1.4" />
      <circle cx="28" cy="24" r="2" fill="var(--share-accent)" />
      <circle cx="40" cy="24" r="2" fill="var(--share-accent)" />
    </svg>
  );
}

function WashiEdge() {
  return (
    <svg viewBox="0 0 320 16" preserveAspectRatio="none" fill="none">
      <rect width="320" height="16" fill="var(--share-accent)" fillOpacity="0.35" />
      <path d="M0 8h320" stroke="#F5C6C6" strokeDasharray="2 7" />
    </svg>
  );
}

function PageNumber() {
  return (
    <svg viewBox="0 0 64 28" fill="none">
      <text x="0" y="18" fill="currentColor" fontFamily="serif" fontSize="15">
        01
      </text>
      <line
        x1="28"
        y1="14"
        x2="64"
        y2="14"
        stroke="color-mix(in srgb, var(--share-accent) 85%, var(--share-text))"
        strokeWidth="1"
      />
    </svg>
  );
}

/** 解锁成功序章：己方 envelope 资产，色值走 --share-* */
export function ShareRevealEnvelope() {
  return (
    <svg
      className="share-reveal-envelope"
      viewBox="0 0 96 72"
      width="96"
      height="72"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="6"
        y="10"
        width="84"
        height="54"
        rx="6"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 14l40 28 40-28M8 62l28-22m52 22L60 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M48 50s-8-5-10-9c-2-3 0-7 4-7 2 0 4 1 6 3 2-2 4-3 6-3 4 0 6 4 4 7-2 4-10 9-10 9z"
        fill="currentColor"
      />
    </svg>
  );
}
