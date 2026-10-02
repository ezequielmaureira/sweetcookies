import QRCode from "qrcode";
import { voucherUrl } from "@/lib/vouchers/voucher-format";
import styles from "./VoucherCheck.module.css";

const QUIET = 4;

/**
 * QR grande para mostrar desde el celular en el local (SVG: nítido a cualquier
 * tamaño). Mismo destino que el QR del voucher: /v/<publicId>.
 */
export function VoucherQr({ publicId, code }: { publicId: string; code: string }) {
  const qr = QRCode.create(voucherUrl(publicId), { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const total = size + QUIET * 2;
  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.modules.get(row, col)) path += `M${col + QUIET} ${row + QUIET}h1v1h-1z`;
    }
  }
  return (
    <figure className={styles.qr}>
      <svg viewBox={`0 0 ${total} ${total}`} shapeRendering="crispEdges" role="img" aria-label={`Código QR del voucher ${code}`}>
        <rect width={total} height={total} fill="#fff" />
        <path d={path} fill="#1f150f" />
      </svg>
      <figcaption>Mostrá este QR al retirar tu caja</figcaption>
    </figure>
  );
}
