import { BRAND } from "@/config/brand";
import { cn } from "@/lib/utils";

export type BrandMarkProps = {
  /** Pixel width and height (square). */
  size?: number;
  className?: string;
  /** When true, alt is empty (use when adjacent text names Stocksist). */
  decorative?: boolean;
  /** Override alt when not decorative. Defaults to BRAND.name. */
  alt?: string;
};

export function BrandMark({
  size = 32,
  className,
  decorative = false,
  alt,
}: BrandMarkProps) {
  return (
    <img
      src={BRAND.iconSrc}
      alt={decorative ? "" : (alt ?? BRAND.name)}
      width={size}
      height={size}
      className={cn("aspect-square object-contain shrink-0", className)}
      decoding="async"
    />
  );
}
