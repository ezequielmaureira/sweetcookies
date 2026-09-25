import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider, SignIn } from "@clerk/nextjs";
import { Brand } from "@/components/brand/Brand";
import { brandImages } from "@/data/cookies";
import { resolveImage } from "@/lib/images";
import { ADMIN_HOME_URL, ADMIN_SIGN_IN_URL } from "@/lib/admin/config";
import { clerkAppearance, clerkLocalization } from "@/lib/admin/clerk-appearance";
import styles from "@/components/admin/Admin.module.css";

export const metadata: Metadata = {
  title: "Ingresar — Sweet Cookies",
  robots: { index: false, follow: false },
};

export default function SignInPage() {
  return (
    <ClerkProvider appearance={clerkAppearance} localization={clerkLocalization} signInUrl={ADMIN_SIGN_IN_URL} signInFallbackRedirectUrl={ADMIN_HOME_URL}>
      <main id="contenido" className={styles.signIn}>
        <Link href="/" className={styles.brand} aria-label="Sweet Cookies, volver a la web">
          <Brand logoSrc={resolveImage(brandImages.logo)} decorative />
        </Link>
        <SignIn routing="path" path={ADMIN_SIGN_IN_URL} fallbackRedirectUrl={ADMIN_HOME_URL} />
      </main>
    </ClerkProvider>
  );
}
