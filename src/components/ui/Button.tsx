import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost";

type ButtonLinkProps = {
  href: string;
  variant?: Variant;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
};

export function ButtonLink({ href, variant = "primary", arrow = false, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}>
      <span>{children}</span>
      {arrow && (
        <svg className={styles.arrow} viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </Link>
  );
}
