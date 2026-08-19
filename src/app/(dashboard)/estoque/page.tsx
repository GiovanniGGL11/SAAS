import { requireCurrentCompany } from '@/server/auth/require-current-company';
import { listAllProducts } from '@/server/data/stock';
import { serializeProduct } from '@/lib/serialize';
import { ProductList } from '@/components/estoque/product-list';

export default async function EstoquePage() {
  const { company } = await requireCurrentCompany();
  const products = await listAllProducts(company.id);

  return <ProductList initialProducts={products.map(serializeProduct)} />;
}
