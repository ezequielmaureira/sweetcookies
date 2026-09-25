import Link from "next/link";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost";

type CommonProps = {
  variant?: Variant;
  arrow?: boolean;
  className?: string;
  children: React.ReactNode;
};

function classes(variant: Variant, className?: string) {
  return [styles.button, styles[variant], className].filter(Boolean).join(" ");
}

function Arrow() {
  return (
    <svg className={styles.arrow} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type ButtonLinkProps = CommonProps & { href: string };

export function ButtonLink({ href, variant = "primary", arrow = false, className, children }: ButtonLinkProps) {
  return (
    <Link href={href} className={classes(variant, className)}>
      <span>{children}</span>
      {arrow && <Arrow />}
    </Link>
  );
}

type ButtonProps = CommonProps & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children">;

/** Mismo estilo que ButtonLink, para acciones (<button>). */
export function Button({ variant = "primary", arrow = false, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={classes(variant, className)} {...rest}>
      <span>{children}</span>
      {arrow && <Arrow />}
    </button>
  );
}
