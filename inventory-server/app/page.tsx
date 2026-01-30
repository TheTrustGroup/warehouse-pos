import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function Home() {
  return (
    <main>
      <h1>Inventory (Nuclear — Server only)</h1>
      <p><Link href="/inventory">Open Inventory</Link> — Server Components, direct DB, Server Actions, full refresh on write.</p>
    </main>
  );
}
