"use client";

import { useCallback, useRef, useState } from "react";
import type { MonthAnchor } from "../../lib/library-virtual";

export function LibraryTimeline({
  anchors,
  totalHeight,
  scrollTop,
  onJump,
  mobile,
}: {
  anchors: readonly MonthAnchor[];
  totalHeight: number;
  scrollTop: number;
  onJump: (offset: number) => void;
  mobile: boolean;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);

  const pickOffset = useCallback(
    (clientY: number) => {
      const rail = railRef.current;
      if (!rail || anchors.length === 0 || totalHeight <= 0) return null;
      const rect = rail.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
      const target = ratio * totalHeight;
      let anchor = anchors[0]!;
      for (const item of anchors) {
        if (item.offset <= target) anchor = item;
        else break;
      }
      return { offset: anchor.offset, label: anchor.label };
    },
    [anchors, totalHeight],
  );

  const onPointer = (event: React.PointerEvent) => {
    const picked = pickOffset(event.clientY);
    if (!picked) return;
    setBubble(picked.label);
    onJump(picked.offset);
  };

  if (anchors.length < 2) return null;

  const thumbRatio = totalHeight > 0 ? Math.min(1, scrollTop / totalHeight) : 0;

  return (
    <div
      className={mobile ? "lib-timeline lib-timeline-mobile" : "lib-timeline"}
      aria-hidden={mobile && !dragging && !bubble}
    >
      <div
        ref={railRef}
        className="lib-timeline-rail"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          onPointer(event);
        }}
        onPointerMove={(event) => {
          if (!dragging && event.pointerType !== "touch") return;
          if (event.buttons === 0 && event.pointerType === "mouse") return;
          onPointer(event);
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => {
          setDragging(false);
          setBubble(null);
        }}
        onPointerLeave={() => {
          if (!dragging) setBubble(null);
        }}
      >
        <span className="lib-timeline-thumb" style={{ top: `${thumbRatio * 100}%` }} />
      </div>
      {bubble ? <span className="lib-timeline-bubble" role="status">{bubble}</span> : null}
    </div>
  );
}
