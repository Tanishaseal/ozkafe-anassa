import photos from '@/data/menu-photo-credits.json';
import Link from 'next/link';

export const metadata = { title: 'Menu photo credits | OZKAFE ANASSA' };

export default function PhotoCredits() {
  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px', lineHeight: 1.7 }}>
      <Link href="/">Back to menu</Link>
      <h1>Menu photo credits</h1>
      <p>Real photographs from independent photographers. Images illustrate the dishes and drinks; our presentation may vary. Photographs have been resized and converted to WebP with their full frames and backgrounds retained.</p>
      <ul style={{ paddingLeft: 20 }}>
        {photos.map(photo => (
          <li key={photo.id} style={{ marginBottom: 20, overflowWrap: 'anywhere' }}>
            <strong>{photo.name}</strong> — <a href={photo.source}>{photo.title.replace(/^File:/, '')}</a>
            {' '}by {photo.author}.{' '}
            <a href={photo.licenseUrl}>{photo.license}</a>.
          </li>
        ))}
      </ul>
    </main>
  );
}
