'use client';

import { useId, useState } from 'react';
import { isMenuImageUrl } from '@/lib/menuImage';

export default function MenuImageField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [failedUrl, setFailedUrl] = useState('');
  const src = value.trim();
  return (
    <div className="admin-form-group">
      <label htmlFor={id} className="admin-form-label">Image URL</label>
      <input id={id} type="text" inputMode="url" required value={value}
        className="admin-form-input" placeholder="https://example.com/dish.jpg"
        onChange={event => {
          const next = event.target.value;
          event.target.setCustomValidity(isMenuImageUrl(next) ? '' : 'Enter an HTTP/HTTPS image link or a local image path.');
          setFailedUrl('');
          onChange(next);
        }} />
      <p style={{ fontSize: 12, color: 'var(--adm-text-muted)', margin: '6px 0' }}>
        Paste a direct image link, not a webpage link. Save Changes to publish it to the menu.
      </p>
      {isMenuImageUrl(src) && failedUrl !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="Dish image preview" onError={() => setFailedUrl(src)}
          style={{ width: '100%', maxWidth: 300, aspectRatio: '3 / 2', objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
      )}
      {failedUrl === src && src && <p role="status" style={{ fontSize: 12 }}>Preview could not load. Check that the link is a publicly accessible image.</p>}
    </div>
  );
}
