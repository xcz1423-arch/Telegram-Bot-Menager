export async function prepareSquareAvatarJpeg(file: File, size = 112, quality = 0.74): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Failed to decode selected image.'));
      el.src = objectUrl;
    });

    const side = Math.max(1, Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const sx = Math.floor(((img.naturalWidth || img.width) - side) / 2);
    const sy = Math.floor(((img.naturalHeight || img.height) - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
