import { useRef, useState } from 'react';
import type { CSSProperties, TouchEvent, TouchList } from 'react';

const MAX = 4;

interface Point {
  x: number;
  y: number;
}

interface Zoom {
  scale: number;
  x: number;
  y: number;
}

const NONE: Zoom = { scale: 1, x: 0, y: 0 };

function spread(touches: TouchList): number {
  return Math.hypot(
    touches[0].clientX - touches[1].clientX,
    touches[0].clientY - touches[1].clientY,
  );
}

function middle(touches: TouchList): Point {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function limit(rect: DOMRect, zoom: Zoom): Zoom {
  const maxX = Math.max(0, (rect.width * zoom.scale - rect.width) / 2);
  const maxY = Math.max(0, (rect.height * zoom.scale - rect.height) / 2);
  return {
    scale: zoom.scale,
    x: Math.min(maxX, Math.max(-maxX, zoom.x)),
    y: Math.min(maxY, Math.max(-maxY, zoom.y)),
  };
}

export function usePinch() {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>(NONE);
  const pinch = useRef<{ rect: DOMRect; gap: number; point: Point; from: Zoom } | null>(null);
  const pan = useRef<{ rect: DOMRect; point: Point; from: Zoom } | null>(null);
  const used = useRef(false);

  function onTouchStart(event: TouchEvent) {
    const node = box.current;
    if (!node) return;

    if (event.touches.length === 2) {
      pan.current = null;
      used.current = true;
      pinch.current = {
        rect: node.getBoundingClientRect(),
        gap: spread(event.touches),
        point: middle(event.touches),
        from: zoom,
      };
      return;
    }

    if (event.touches.length === 1 && zoom.scale > 1) {
      used.current = true;
      pan.current = {
        rect: node.getBoundingClientRect(),
        point: { x: event.touches[0].clientX, y: event.touches[0].clientY },
        from: zoom,
      };
      return;
    }

    used.current = false;
  }

  function onTouchMove(event: TouchEvent) {
    const gesture = pinch.current;
    if (gesture && event.touches.length === 2) {
      const scale = Math.min(MAX, Math.max(1, (gesture.from.scale * spread(event.touches)) / gesture.gap));
      const growth = scale / gesture.from.scale;
      const point = middle(event.touches);
      const center = {
        x: gesture.rect.left + gesture.rect.width / 2,
        y: gesture.rect.top + gesture.rect.height / 2,
      };
      setZoom(
        limit(gesture.rect, {
          scale,
          x: point.x - center.x - (gesture.point.x - center.x - gesture.from.x) * growth,
          y: point.y - center.y - (gesture.point.y - center.y - gesture.from.y) * growth,
        }),
      );
      return;
    }

    const drag = pan.current;
    if (drag && event.touches.length === 1) {
      setZoom(
        limit(drag.rect, {
          scale: drag.from.scale,
          x: drag.from.x + event.touches[0].clientX - drag.point.x,
          y: drag.from.y + event.touches[0].clientY - drag.point.y,
        }),
      );
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (event.touches.length < 2) pinch.current = null;
    if (event.touches.length === 0) {
      pan.current = null;
      if (zoom.scale <= 1) setZoom(NONE);
    }
  }

  function reset() {
    pinch.current = null;
    pan.current = null;
    used.current = false;
    setZoom(NONE);
  }

  return {
    ref: box,
    used,
    zoomed: zoom.scale > 1,
    style: {
      '--zs': String(zoom.scale),
      '--zx': `${zoom.x}px`,
      '--zy': `${zoom.y}px`,
    } as CSSProperties,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    reset,
  };
}
