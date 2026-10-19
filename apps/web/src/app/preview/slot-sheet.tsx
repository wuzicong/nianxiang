import type { AlbumTheme } from "../../lib/album-theme";
import type { DemoBeat, DemoPhoto, FilledSlot } from "../../lib/album-demo";

export function SvgMark({
  markup,
  className,
  stretch = false,
}: {
  markup: string | undefined;
  className?: string;
  stretch?: boolean;
}) {
  if (!markup) return null;
  const html =
    stretch && !markup.includes("preserveAspectRatio")
      ? markup.replace("<svg", '<svg preserveAspectRatio="none"')
      : markup;
  return <span className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

function pageNumberMarkup(markup: string | undefined, page: number): string | undefined {
  if (!markup) return undefined;
  const label = String(page).padStart(2, "0");
  return markup.includes(">01<") ? markup.replace(">01<", `>${label}<`) : markup;
}

function Photo({ photo, onError }: { photo: DemoPhoto; onError?: (src: string) => void }) {
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      data-photo-id={photo.id}
      referrerPolicy="no-referrer"
      onError={() => onError?.(photo.src)}
    />
  );
}

function FramePhoto({ photo, onError }: { photo: DemoPhoto | undefined; onError?: (src: string) => void }) {
  if (!photo) return <p className="gap-copy">预览生成后出现在这里</p>;
  return <Photo photo={photo} onError={onError} />;
}

function Beats({ beats, kind }: { beats: DemoBeat[]; kind: "timeline" | "route" | "contents" }) {
  return (
    <ol className={kind}>
      {beats.map((beat) => (
        <li key={`${beat.label}-${beat.text}`}>
          <span className="beat-label">{beat.label}</span>
          <span>{beat.text}</span>
        </li>
      ))}
    </ol>
  );
}

export function SlotSheet({
  theme,
  slot,
  decorations,
  mode,
  pageNumber,
  pageCount,
  onPhotoError,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
  mode: "story" | "flip";
  pageNumber: number;
  pageCount: number;
  onPhotoError?: (src: string) => void;
}) {
  const themeId = theme.skin.id;
  return (
    <article
      className="slot"
      data-mode={mode}
      data-slot-type={slot.type}
      data-slot-id={slot.id}
      data-hint={slot.hint ?? undefined}
    >
      {themeId === "kyoto-lantern" ? (
        <SvgMark markup={decorations["washi-edge"]} className="deco-washi-edge" />
      ) : null}
      {themeId === "magazine-heirloom" ? (
        <SvgMark markup={pageNumberMarkup(decorations["page-number"], pageNumber)} className="deco-folio" />
      ) : null}
      <SlotBody
        theme={theme}
        slot={slot}
        decorations={decorations}
        pageNumber={pageNumber}
        pageCount={pageCount}
        onPhotoError={onPhotoError}
      />
      {themeId === "cotton-candy" ? <SvgMark markup={decorations["torn-edge"]} className="deco-torn" /> : null}
    </article>
  );
}

function SlotBody({
  theme,
  slot,
  decorations,
  pageNumber,
  pageCount,
  onPhotoError,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
  pageNumber: number;
  pageCount: number;
  onPhotoError?: (src: string) => void;
}) {
  if (slot.id === "full-bleed") return <Bleed slot={slot} onPhotoError={onPhotoError} />;
  if (slot.type === "hero") return <Hero theme={theme} slot={slot} decorations={decorations} onPhotoError={onPhotoError} />;
  if (slot.type === "spread-2") return <Spread theme={theme} slot={slot} onPhotoError={onPhotoError} />;
  if (slot.type === "polaroid-wall") return <Wall theme={theme} slot={slot} decorations={decorations} onPhotoError={onPhotoError} />;
  if (slot.type === "timeline") return <TimelineBlock slot={slot} />;
  if (slot.type === "map-chapter") return <MapBlock theme={theme} slot={slot} decorations={decorations} />;
  if (slot.type === "closing") {
    return <Closing theme={theme} slot={slot} decorations={decorations} pageNumber={pageNumber} pageCount={pageCount} />;
  }
  return <Quote theme={theme} slot={slot} decorations={decorations} />;
}

function Hero({
  theme,
  slot,
  decorations,
  onPhotoError,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
  onPhotoError?: (src: string) => void;
}) {
  const photo = slot.photos[0];
  const themeId = theme.skin.id;
  return (
    <div className="hero">
      <p className="kicker">{slot.kicker}</p>
      <h2 className="hero-title">{slot.title}</h2>
      {themeId === "magazine-heirloom" ? (
        <SvgMark markup={decorations["gold-accent-line"]} className="deco-gold" stretch />
      ) : null}
      <figure className="hero-frame">
        <div className="frame">
          <FramePhoto photo={photo} onError={onPhotoError} />
        </div>
        {themeId === "cotton-candy" ? (
          <>
            <SvgMark markup={decorations["washi-tape"]} className="deco-tape" />
            <SvgMark markup={decorations["heart-sticker"]} className="deco-heart" />
          </>
        ) : null}
        {themeId === "kyoto-lantern" ? <SvgMark markup={decorations["lantern-glow"]} className="deco-lantern" /> : null}
      </figure>
      <div className="hero-copy">
        {photo ? <p className="caption">{photo.caption}</p> : null}
        <p className="lede">{slot.body}</p>
      </div>
    </div>
  );
}

function Bleed({ slot, onPhotoError }: { slot: FilledSlot; onPhotoError?: (src: string) => void }) {
  const photo = slot.photos[0];
  return (
    <div className="bleed">
      {photo ? <Photo photo={photo} onError={onPhotoError} /> : <p className="gap-copy bleed-gap">预览生成后出现在这里</p>}
      <div className="bleed-copy">
        <p className="kicker">{slot.kicker}</p>
        <h2 className="hero-title">{slot.title}</h2>
        <p>{photo?.caption}</p>
      </div>
    </div>
  );
}

function Spread({
  theme,
  slot,
  onPhotoError,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  onPhotoError?: (src: string) => void;
}) {
  const cells = [slot.photos[0], slot.photos[1]];
  return (
    <div className="spread-block">
      <p className="kicker">{slot.kicker}</p>
      <h2 className="section-title">{slot.title}</h2>
      {theme.skin.id === "magazine-heirloom" ? null : <p className="lede">{slot.body}</p>}
      <div className="spread">
        {cells.map((photo, index) => (
          <figure key={photo?.id ?? `gap-${index}`}>
            <div className="frame">
              <FramePhoto photo={photo} onError={onPhotoError} />
            </div>
            <figcaption>{photo?.caption ?? "空位"}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

function Wall({
  theme,
  slot,
  decorations,
  onPhotoError,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
  onPhotoError?: (src: string) => void;
}) {
  const tilts = theme.stickerTiltDeg;
  const photos = slot.photos.length > 0 ? slot.photos : [undefined];
  return (
    <div className="wall-block">
      <p className="kicker">{slot.kicker}</p>
      <h2 className="section-title">{slot.title}</h2>
      <div className="wall">
        {photos.map((photo, index) => {
          const tilt = tilts[index % tilts.length] ?? 0;
          return (
            <figure key={photo?.id ?? "gap"} className="polaroid" style={{ ["--tilt" as string]: `${tilt}deg` }}>
              <div className="frame">
                <FramePhoto photo={photo} onError={onPhotoError} />
              </div>
              <figcaption>{photo?.caption ?? "空位"}</figcaption>
              {theme.skin.id === "cotton-candy" ? (
                <SvgMark markup={decorations["washi-tape"]} className="deco-tape" />
              ) : null}
              {theme.skin.id === "kyoto-lantern" ? (
                <SvgMark markup={decorations["postage-stamp"]} className="deco-stamp" />
              ) : null}
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function Quote({
  theme,
  slot,
  decorations,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
}) {
  return (
    <div className="quote">
      <p className="kicker">{slot.kicker}</p>
      {theme.skin.id === "magazine-heirloom" ? (
        <SvgMark markup={decorations["gold-accent-line"]} className="deco-gold" stretch />
      ) : null}
      <h2 className="section-title">{slot.title}</h2>
      <blockquote className="quote-text">{slot.body}</blockquote>
      {slot.beats.length > 0 ? <Beats beats={slot.beats} kind="contents" /> : null}
      {theme.skin.id === "kyoto-lantern" ? <SvgMark markup={decorations["ticket-stub"]} className="deco-ticket" /> : null}
      {theme.skin.id === "cotton-candy" ? <SvgMark markup={decorations["heart-sticker"]} className="deco-heart-inline" /> : null}
      {theme.skin.id === "magazine-heirloom" ? (
        <SvgMark markup={decorations["thin-rule"]} className="deco-rule" stretch />
      ) : null}
    </div>
  );
}

function TimelineBlock({ slot }: { slot: FilledSlot }) {
  return (
    <div className="timeline-block">
      <p className="kicker">{slot.kicker}</p>
      <h2 className="section-title">{slot.title}</h2>
      <p className="lede">{slot.body}</p>
      <Beats beats={slot.beats} kind="timeline" />
    </div>
  );
}

function MapBlock({
  theme,
  slot,
  decorations,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
}) {
  return (
    <div className="map-block">
      <p className="kicker">{slot.kicker}</p>
      <h2 className="section-title">{slot.title}</h2>
      <p className="lede">{slot.body}</p>
      <SvgMark markup={decorations["lantern-glow"]} className="deco-lantern-inline" />
      <Beats beats={slot.beats} kind="route" />
      {theme.skin.id === "kyoto-lantern" ? <SvgMark markup={decorations["ticket-stub"]} className="deco-ticket" /> : null}
    </div>
  );
}

function Closing({
  theme,
  slot,
  decorations,
  pageNumber,
  pageCount,
}: {
  theme: AlbumTheme;
  slot: FilledSlot;
  decorations: Record<string, string>;
  pageNumber: number;
  pageCount: number;
}) {
  return (
    <div className="closing">
      <p className="kicker">{slot.kicker}</p>
      {theme.skin.id === "magazine-heirloom" ? (
        <SvgMark markup={decorations["thin-rule"]} className="deco-rule" stretch />
      ) : null}
      {theme.skin.id === "cotton-candy" ? <SvgMark markup={decorations["heart-sticker"]} className="deco-heart-inline" /> : null}
      {theme.skin.id === "kyoto-lantern" ? <SvgMark markup={decorations["lantern-glow"]} className="deco-lantern-inline" /> : null}
      <h2 className="hero-title">{slot.title}</h2>
      <p className="lede">{slot.body}</p>
      <p className="sign">{theme.shareSubtitle}</p>
      <p className="folio-line">
        {pageNumber} / {pageCount}
      </p>
    </div>
  );
}
