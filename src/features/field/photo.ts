/** Réduit une photo (côté long 1 600 px, JPEG 72 %) : ~300 Ko, rapide à stocker en local et à envoyer en salle. */
export async function compressImage(
  file: Blob,
  maxSide = 1600,
  quality = 0.72,
): Promise<{ blob: Blob; mime: string }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    )
    if (blob && blob.size < file.size) return { blob, mime: 'image/jpeg' }
  } catch {
    /* format non décodable : on garde le fichier d'origine */
  }
  return { blob: file, mime: file.type || 'image/jpeg' }
}
