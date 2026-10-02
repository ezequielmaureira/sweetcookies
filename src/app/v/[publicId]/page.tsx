import type { Metadata } from "next";
import Link from "next/link";
import { ClerkProvider } from "@clerk/nextjs";
import { Brand } from "@/components/brand/Brand";
import { AdminVoucherCheck } from "@/components/vouchers/AdminVoucherCheck";
import { VoucherCanvas } from "@/components/vouchers/VoucherCanvas";
import { VoucherStatusCard } from "@/components/vouchers/VoucherStatusCard";
import styles from "@/components/vouchers/VoucherCheck.module.css";
import { brandImages } from "@/data/cookies";
import { getAdminAccess } from "@/lib/admin/auth";
import { ADMIN_SIGN_IN_URL } from "@/lib/admin/config";
import { clerkAppearance, clerkLocalization } from "@/lib/admin/clerk-appearance";
import { resolveImage } from "@/lib/images";
import { lookupVoucher } from "@/lib/vouchers/voucher-server";

export const metadata: Metadata = {
  title: "Voucher — Sweet Cookies",
  robots: { index: false, follow: false },
};

// Estado real en cada escaneo (nunca una versión guardada).
export const dynamic = "force-dynamic";

/**
 * El voucher online: /v/<publicId> (link que recibe el cliente y destino del QR).
 * Cliente: ve su voucher (mismo diseño) y un QR grande para mostrar en el local.
 * Admin (sesión de Clerk + ADMIN_EMAILS, verificado en el servidor): ve el
 * estado real y el botón para canjear.
 */
export default async function VoucherPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const [lookup, access] = await Promise.all([lookupVoucher(publicId), getAdminAccess()]);
  const isAdmin = access.status === "admin";

  let content: React.ReactNode;
  if (lookup.status === "error") {
    content = (
      <article className={`${styles.card} ${styles.invalid}`}>
        <h1 className={styles.heading}>No pudimos verificar el voucher</h1>
        <p className={styles.note}>Revisá la conexión y volvé a escanear el QR en unos segundos.</p>
      </article>
    );
  } else if (lookup.status === "found" && isAdmin) {
    content = (
      <ClerkProvider appearance={clerkAppearance} localization={clerkLocalization} signInUrl={ADMIN_SIGN_IN_URL}>
        <AdminVoucherCheck initial={lookup.voucher} />
      </ClerkProvider>
    );
  } else {
    content = <VoucherStatusCard voucher={lookup.status === "found" ? lookup.voucher : null} showQr />;
  }

  return (
    <main id="contenido" className={styles.page}>
      <Link href="/" className={styles.logo} aria-label="Sweet Cookies, ir a la web">
        <Brand logoSrc={resolveImage(brandImages.logo)} size="sm" decorative />
      </Link>
      {lookup.status === "found" && lookup.voucher.status === "ACTIVE" && (
        <div className={styles.art}>
          <VoucherCanvas art={lookup.voucher} />
        </div>
      )}
      {content}
      {lookup.status === "found" && lookup.voucher.status === "ACTIVE" && !isAdmin && (
        <p className={styles.staff}>
          <Link href={`${ADMIN_SIGN_IN_URL}?redirect_url=${encodeURIComponent(`/v/${publicId}`)}`}>Personal de Sweet Cookies: ingresar para canjear</Link>
        </p>
      )}
    </main>
  );
}
