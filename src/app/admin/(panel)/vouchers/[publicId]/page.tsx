import { notFound } from "next/navigation";
import { VoucherDetail } from "@/components/admin/vouchers/VoucherDetail";
import { isValidPublicId } from "@/lib/vouchers/voucher-format";

/** /admin/vouchers/<publicId>: ver un voucher del historial. */
export default async function AdminVoucherPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  if (!isValidPublicId(publicId)) notFound();
  return <VoucherDetail publicId={publicId} />;
}
