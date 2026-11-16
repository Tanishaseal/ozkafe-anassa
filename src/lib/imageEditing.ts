export type ImageEdits = { zoom: number; x: number; y: number; rotation: number; flipX: boolean; flipY: boolean; width: number };
export const defaultImageEdits: ImageEdits = { zoom: 1, x: 0, y: 0, rotation: 0, flipX: false, flipY: false, width: 1200 };
export function imageGeometry(image: HTMLImageElement, edits: ImageEdits, width: number, height: number) {
  const rotated = edits.rotation % 2 !== 0;
  const iw = rotated ? image.naturalHeight : image.naturalWidth;
  const ih = rotated ? image.naturalWidth : image.naturalHeight;
  const scale = Math.max(width / iw, height / ih) * edits.zoom;
  return { scale, maxX: Math.max(0, (iw * scale - width) / 2), maxY: Math.max(0, (ih * scale - height) / 2) };
}
export function drawEditedImage(canvas: HTMLCanvasElement, image: HTMLImageElement, edits: ImageEdits) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not open the image editor');
  const { width, height } = canvas;
  const { scale, maxX, maxY } = imageGeometry(image, edits, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + edits.x * maxX, height / 2 + edits.y * maxY);
  ctx.scale(edits.flipX ? -1 : 1, edits.flipY ? -1 : 1);
  ctx.rotate(edits.rotation * Math.PI / 2);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  ctx.restore();
}
