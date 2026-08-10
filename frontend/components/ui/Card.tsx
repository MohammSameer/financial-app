import type { HTMLAttributes, ReactNode } from "react";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds hover lift and a focus ring. Caller supplies role/tabIndex. */
  interactive?: boolean;
  /** Uniform padding, for cards with no header/body split. */
  padded?: boolean;
}

export function Card({
  interactive,
  padded,
  className,
  children,
  ...rest
}: CardProps) {
  const classes = [
    styles.card,
    interactive && styles.interactive,
    padded && styles.padded,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Heading level. Defaults to h2; pass h3 when nested inside a section. */
  as?: "h2" | "h3" | "h4";
  id?: string;
}

/**
 * Renders a real heading element, not a styled div. Screen-reader users
 * navigate a dense dashboard by jumping between headings, so the card titles
 * are the document outline.
 */
export function CardHeader({
  title,
  subtitle,
  actions,
  as: Heading = "h2",
  id,
}: CardHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <Heading className={styles.title} id={id}>
          {title}
        </Heading>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

export function CardBody({
  flush,
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { flush?: boolean }) {
  return (
    <div
      className={[styles.body, flush && styles.bodyFlush, className]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
