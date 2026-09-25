/* Reduz uma imagem (arquivo da câmera ou da galeria) a um JPEG pequeno em data URL.
   - selfie do aluno: 160 px, quadrada (recorte central) → ~10 KB
   - foto do ponto no pin: 800 px no lado maior → ~120–160 KB (é prova para o relatório do aluno)
   Usa createImageBitmap com orientação EXIF quando o navegador tem; senão <img>. */

export async function arquivoParaJpeg(file, { lado = 640, quadrado = false, qualidade = 0.72 } = {}) {
  const im = await carregar(file)
  const w = im.width, h = im.height
  let sx = 0, sy = 0, sw = w, sh = h
  if (quadrado) { const m = Math.min(w, h); sx = (w - m) / 2; sy = (h - m) / 2; sw = m; sh = m }
  const esc = Math.min(1, lado / Math.max(sw, sh))
  const cw = Math.max(1, Math.round(sw * esc)), ch = Math.max(1, Math.round(sh * esc))
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  cv.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, cw, ch)
  if (im.close) im.close()
  return cv.toDataURL('image/jpeg', qualidade)
}

async function carregar(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch (e) { /* cai para <img> */ }
  }
  return new Promise((ok, err) => {
    const url = URL.createObjectURL(file)
    const im = new Image()
    im.onload = () => { URL.revokeObjectURL(url); ok(im) }
    im.onerror = () => { URL.revokeObjectURL(url); err(new Error('imagem inválida')) }
    im.src = url
  })
}

/* Imagem de material de aula (quadro de HQ, figura de cartão) → WebP.
   WebP com 1280 px de largura é a regra anotada em CLAUDE.md: um quadro de HQ
   fica em 60–120 KB e nítido em qualquer celular. Não recorta e não deita a
   arte: o lado maior manda, e quem decide o formato é o arquivo — é isso que
   faz o mesmo leitor servir HQ vertical e horizontal.
   Devolve também largura e altura, que vão para o banco: com elas o <img> já
   nasce com o espaço certo e a tela não pula quando o quadro carrega. */
export async function arquivoParaWebp(file, { lado = 1280, qualidade = 0.82 } = {}) {
  const im = await carregar(file)
  const esc = Math.min(1, lado / Math.max(im.width, im.height))
  const cw = Math.max(1, Math.round(im.width * esc)), ch = Math.max(1, Math.round(im.height * esc))
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch
  cv.getContext('2d').drawImage(im, 0, 0, cw, ch)
  if (im.close) im.close()
  const blob = await new Promise(ok => cv.toBlob(ok, 'image/webp', qualidade))
  // navegador sem WebP no canvas devolve PNG ou nada: cai para JPEG
  if (blob && blob.type === 'image/webp') return { blob, largura: cw, altura: ch }
  const jpeg = await new Promise(ok => cv.toBlob(ok, 'image/jpeg', qualidade))
  if (!jpeg) throw new Error('não consegui converter a imagem')
  return { blob: jpeg, largura: cw, altura: ch }
}
