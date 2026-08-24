import type { Brand } from "@/lib/types";

/**
 * Writes the agency's palette and type onto the document as custom properties.
 * Everything downstream reads var(--ink) and friends, so a second matchmaker's
 * portal is a data change, not a code change.
 */
export function BrandStyle({ brand }: { brand: Brand }) {
  const css = `:root{
  --cream:${brand.cream};
  --panel:${brand.panel};
  --input-bg:${brand.inputBg};
  --ink:${brand.ink};
  --text-2:${brand.text2};
  --text-muted:${brand.textMuted};
  --serif:'${brand.serif}', Georgia, serif;
  --sans:'${brand.sans}', -apple-system, BlinkMacSystemFont, sans-serif;
}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export function Wordmark({ brand }: { brand: Brand }) {
  if (brand.logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="logo" src={brand.logoUrl} alt={brand.displayName} />;
  }
  return <span className="wordmark">{brand.displayName}</span>;
}
