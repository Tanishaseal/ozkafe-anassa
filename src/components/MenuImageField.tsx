'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { isMenuImageUrl } from '@/lib/menuImage';
import { defaultImageEdits, drawEditedImage, imageGeometry, type ImageEdits } from '@/lib/imageEditing';

type Props = { value: string; onChange: (value: string) => void; onEditingChange: (active: boolean) => void };
const clamp = (n: number) => Math.max(-1, Math.min(1, n));

export default function MenuImageField({ value, onChange, onEditingChange }: Props) {
  const id = useId();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const drag = useRef<{ x: number; y: number; edits: ImageEdits } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [edits, setEdits] = useState<ImageEdits>({ ...defaultImageEdits });
  const [failedUrl, setFailedUrl] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const src = value.trim();
  const active = !!image || loading || saving;

  useEffect(() => { inputRef.current?.setCustomValidity(isMenuImageUrl(value) ? '' : 'Enter an HTTP/HTTPS image link or a local image path.'); }, [value]);
  useEffect(() => { onEditingChange(active); }, [active, onEditingChange]);
  useEffect(() => () => { generation.current++; onEditingChange(false); }, [onEditingChange]);
  useEffect(() => {
    if (image && canvasRef.current) drawEditedImage(canvasRef.current, image, edits);
  }, [image, edits]);

  async function openImage(file?: File) {
    const current = ++generation.current;
    setError(''); setLoading(true);
    try {
      let blob: Blob;
      if (file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) throw Error('Choose a JPG, PNG or WebP image under 20 MB.');
        blob = file;
      } else {
        if (!isMenuImageUrl(src)) throw Error('Enter a valid image URL first.');
        // Next's same-origin image loader handles remote CORS and blocks private IPs.
        const url = src.startsWith('/') ? src : `/_next/image?url=${encodeURIComponent(src)}&w=3840&q=75`;
        const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw Error('This link could not be opened. Try a direct image link or upload the photo from your device.');
        blob = await response.blob();
      }
      const objectUrl = URL.createObjectURL(blob);
      const next = new window.Image();
      try { next.src = objectUrl; await next.decode(); } finally { URL.revokeObjectURL(objectUrl); }
      if (next.naturalWidth * next.naturalHeight > 40_000_000) throw Error('This photo is too large to edit. Please use a smaller image.');
      if (current !== generation.current) return;
      setImage(next); setEdits({ ...defaultImageEdits });
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : 'Unable to open image');
    } finally { if (current === generation.current) setLoading(false); }
  }

  async function applyImage() {
    if (!image) return;
    const current = generation.current;
    setSaving(true); setError('');
    try {
      const output = document.createElement('canvas');
      output.width = edits.width; output.height = edits.width * 2 / 3;
      drawEditedImage(output, image, edits);
      const blob = await new Promise<Blob>((resolve, reject) => output.toBlob(result => result ? resolve(result) : reject(Error('Could not export this image')), 'image/webp', 0.9));
      if (blob.size > 3 * 1024 * 1024) throw Error('Choose a smaller output size and try again.');
      const token = localStorage.getItem('oz_admin_token');
      const response = await fetch('/api/menu-images', { method: 'POST', body: blob,
        headers: { 'Content-Type': blob.type, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Image could not be saved. Please retry.');
      if (current !== generation.current) return;
      onChange(result.url); setImage(null); setFailedUrl('');
    } catch (e) { if (current === generation.current) setError(e instanceof Error ? e.message : 'Image could not be saved'); }
    finally { if (current === generation.current) setSaving(false); }
  }

  return (
    <div className="admin-form-group menu-image-field">
      <label htmlFor={id} className="admin-form-label">Image URL</label>
      <input ref={inputRef} id={id} type="text" inputMode="url" required value={value} disabled={active}
        className="admin-form-input" placeholder="https://example.com/dish.jpg"
        onChange={event => {
          const next = event.target.value;
          event.target.setCustomValidity(isMenuImageUrl(next) ? '' : 'Enter an HTTP/HTTPS image link or a local image path.');
          setFailedUrl(''); setError(''); onChange(next);
        }} />
      <p className="image-editor-help">Paste a direct image link or upload a JPG, PNG or WebP photo (up to 20 MB). Save the dish to publish your chosen image.</p>
      {!image && <div className="image-editor-actions">
        <button type="button" className="admin-alert-action-btn" disabled={loading || !isMenuImageUrl(src)} onClick={() => openImage()}>{loading ? 'Opening image…' : 'Edit image'}</button>
        <label className="image-upload-label" htmlFor={`${id}-upload`}>Upload photo
          <input id={`${id}-upload`} type="file" accept="image/jpeg,image/png,image/webp" disabled={loading}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void openImage(file); }} />
        </label>
      </div>}
      {!image && isMenuImageUrl(src) && failedUrl !== src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="Dish image preview" onError={() => setFailedUrl(src)}
          style={{ width: '100%', maxWidth: 300, aspectRatio: '3 / 2', objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
      )}
      {!image && failedUrl === src && src && <p role="status" className="image-editor-help">Preview could not load. Check that the link is a publicly accessible image.</p>}
      {image && <fieldset className="image-editor" disabled={saving}>
        <legend>Landscape image editor</legend>
        <p className="image-editor-help">Drag the photo to position it. Only the area inside this frame will be saved.</p>
        <canvas ref={canvasRef} width={600} height={400} aria-label="Landscape crop preview" className="image-editor-canvas"
          onPointerDown={event => { if (saving) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, edits: { ...edits } }; }}
          onPointerMove={event => {
            if (!drag.current || saving) return;
            const start = drag.current;
            const bounds = event.currentTarget.getBoundingClientRect();
            const { maxX, maxY } = imageGeometry(image, start.edits, bounds.width, bounds.height);
            const x = maxX ? clamp(start.edits.x + (event.clientX - start.x) / maxX) : 0;
            const y = maxY ? clamp(start.edits.y + (event.clientY - start.y) / maxY) : 0;
            setEdits(previous => ({ ...previous, x, y }));
          }}
          onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }} />
        <label>Zoom<input aria-label="Zoom" type="range" min="1" max="4" step="0.01" value={edits.zoom} onChange={e => setEdits({ ...edits, zoom: Number(e.target.value) })} /></label>
        <label>Horizontal position<input aria-label="Horizontal position" type="range" min="-1" max="1" step="0.01" value={edits.x} onChange={e => setEdits({ ...edits, x: Number(e.target.value) })} /></label>
        <label>Vertical position<input aria-label="Vertical position" type="range" min="-1" max="1" step="0.01" value={edits.y} onChange={e => setEdits({ ...edits, y: Number(e.target.value) })} /></label>
        <div className="image-editor-actions">
          <button type="button" className="admin-alert-action-btn" onClick={() => setEdits({ ...edits, rotation: (edits.rotation + 3) % 4, x: 0, y: 0 })}>Rotate left</button>
          <button type="button" className="admin-alert-action-btn" onClick={() => setEdits({ ...edits, rotation: (edits.rotation + 1) % 4, x: 0, y: 0 })}>Rotate right</button>
          <button type="button" className="admin-alert-action-btn" aria-pressed={edits.flipX} onClick={() => setEdits({ ...edits, flipX: !edits.flipX })}>Flip horizontal</button>
          <button type="button" className="admin-alert-action-btn" aria-pressed={edits.flipY} onClick={() => setEdits({ ...edits, flipY: !edits.flipY })}>Flip vertical</button>
        </div>
        <label>Output size<select aria-label="Output size" className="admin-form-select" value={edits.width} onChange={e => setEdits({ ...edits, width: Number(e.target.value) })}>
          {[600, 1200, 1800, 2400].map(width => <option key={width} value={width}>{width} × {width * 2 / 3} pixels</option>)}
        </select></label>
        <div className="image-editor-actions">
          <button type="button" className="admin-alert-action-btn" onClick={() => setEdits({ ...defaultImageEdits })}>Reset edits</button>
          <button type="button" className="admin-alert-action-btn" onClick={() => { generation.current++; setImage(null); setError(''); }}>Cancel editing</button>
          <button type="button" className="admin-btn-primary" onClick={applyImage}>{saving ? 'Saving image…' : 'Use edited image'}</button>
        </div>
        <p className="image-editor-help">Apply the image here, then save the dish. Cancelling keeps the current dish photo.</p>
      </fieldset>}
      {error && <p role="alert" className="image-editor-error">{error}</p>}
    </div>
  );
}
