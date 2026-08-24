import type { PhotoFrame } from "@/lib/types";

/**
 * Photos are stored as a URL plus a frame (zoom + focal point) rather than a
 * cropped file, so re-framing is non-destructive and the original upload is
 * never overwritten. The prototype's reframe interaction wrote exactly this
 * shape; production swaps the data URL for object storage without touching it.
 */
export function photoStyle(url: string | null, frame: PhotoFrame | null): React.CSSProperties {
  if (!url) return {};
  const f = frame ?? { x: 50, y: 50, zoom: 1 };
  return {
    backgroundImage: `url(${url})`,
    backgroundSize: `${f.zoom * 100}%`,
    backgroundPosition: `${f.x}% ${f.y}%`,
  };
}

export function EmptyPhoto({ label = "No photo" }: { label?: string }) {
  return (
    <div className="photo-empty">
      <span style={{ fontSize: 18 }} aria-hidden>▢</span>
      <span>{label}</span>
    </div>
  );
}
