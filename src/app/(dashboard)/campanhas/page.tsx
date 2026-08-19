import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAllCoupons } from '@/server/data/coupons';
import { serializeCoupon } from '@/lib/serialize';
import { CouponList } from '@/components/campanhas/coupon-list';

export default async function CampanhasPage() {
  const { company } = await requireCurrentCompany();
  const coupons = await listAllCoupons(company.id);

  return <CouponList initialCoupons={coupons.map(serializeCoupon)} />;
}
