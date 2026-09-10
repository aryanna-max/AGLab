import qrcode from 'qrcode-generator'
import jsQR from 'jsqr'

export const QR_PREFIX = 'AGC1'

// Gera um <canvas> com o QR do payload
export function makeQRCanvas(text, size = 150) {
  let qr = null
  for (let type = 4; type <= 20; type++) {
    try { qr = qrcode(type, 'M'); qr.addData(text); qr.make(); break } catch (e) { qr = null }
  }
  if (!qr) return null
  const count = qr.getModuleCount()
  const quiet = 2, cells = count + quiet * 2
  const px = Math.max(2, Math.floor(size / cells))
  const dim = px * cells
  const cv = document.createElement('canvas')
  cv.width = dim; cv.height = dim
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, dim, dim)
  ctx.fillStyle = '#000'
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px)
  return cv
}

export function qrDataUrl(text, size = 150) {
  const cv = makeQRCanvas(text, size)
  return cv ? cv.toDataURL('image/png') : null
}

export function decodeFromVideo(video, canvas) {
  if (video.readyState !== video.HAVE_ENOUGH_DATA) return null
  const w = video.videoWidth, h = video.videoHeight
  if (!w || !h) return null
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(video, 0, 0, w, h)
  try {
    const img = ctx.getImageData(0, 0, w, h)
    const code = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
    return code && code.data ? code.data : null
  } catch (e) { return null }
}

export function parsePayload(text) {
  const p = String(text).split(';')
  if (p[0] !== QR_PREFIX || p.length < 3) return null
  return { turmaId: p[1], alunoId: p[2] }
}
