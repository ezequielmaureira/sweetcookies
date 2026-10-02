import type { Metadata } from "next";
import Link from "next/link";
import { VoucherImage } from "@/components/vouchers/VoucherImage";
import styles from "@/components/vouchers/VoucherCheck.module.css";
import { VOUCHER_STATUS_LABELS } from "@/lib/vouchers/voucher-format";
import { lookupVoucher } from "@/lib/vouchers/voucher-server";

export const metadata: Metadata = {
  title: "Imagen del voucher — Sweet Cookies",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /v/<publicId>/image: la imagen final del voucher (PNG generado con el mismo
 * render que la vista online). Los datos salen del backend, nunca de la URL.
 * La validez la decide siempre la base: la imagen es solo la pieza visual.
 */
export default async function VoucherImagePage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const lookup = await lookupVoucher(publicId);

  if (lookup.status !== "found") {
    return (
      <main id="contenido" className={styles.page}>
        <article className={`${styles.card} ${styles.invalid}`}>
          <h1 className={styles.heading}>{lookup.status === "not_found" ? "Voucher no válido" : "No pudimos cargar el voucher"}</h1>
        </article>
      </main>
    );
  }

  const { voucher } = lookup;
  return (
    <main id="contenido" className={styles.imagePage}>
      <VoucherImage art={voucher} />
      {voucher.status !== "ACTIVE" && <p className={styles.imageStatus}>Este voucher está {VOUCHER_STATUS_LABELS[voucher.status].toLowerCase()}.</p>}
      <Link href={`/v/${encodeURIComponent(voucher.publicId)}`} className={styles.imageLink}>
        Ver voucher online
      </Link>
    </main>
  );
}
