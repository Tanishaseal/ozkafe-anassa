import CustomerMenu from '@/components/CustomerMenu';
import { getCategories, getMenuItems, getAddons, getCafeSettings } from '@/lib/store';

export const revalidate = 0; // Fresh data on each request

interface PageProps {
  searchParams: Promise<{ table?: string; key?: string }>;
}

export default async function Page({ searchParams }: PageProps) {
  const params = await searchParams;
  const table = params?.table || 'Takeaway';
  const key = params?.key;

  const [categories, items, addons, settings] = await Promise.all([
    getCategories(),
    getMenuItems(),
    getAddons(),
    getCafeSettings(),
  ]);

  return (
    <main>
      <CustomerMenu
        initialCategories={categories}
        initialItems={items}
        initialAddons={addons}
        initialTable={table}
        initialKey={key}
        initialSettings={settings}
      />
    </main>
  );
}
