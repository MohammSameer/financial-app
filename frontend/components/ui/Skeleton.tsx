import styles from "./Skeleton.module.css";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  /** Pill shape sized to the current font, for inline text placeholders. */
  text?: boolean;
  className?: string;
  radius?: string;
}

export function Skeleton({
  width,
  height,
  text,
  className,
  radius,
}: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, text && styles.text, className]
        .filter(Boolean)
        .join(" ")}
      style={{
        display: "block",
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius: radius,
      }}
      // The container that owns the loading state carries aria-busy and the
      // live region; individual bars are decorative and would otherwise be
      // announced as a stream of meaningless elements.
      aria-hidden="true"
    />
  );
}
