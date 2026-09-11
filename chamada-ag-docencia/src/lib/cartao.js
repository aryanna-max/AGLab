import { makeQRCanvas, QR_PREFIX } from './qr'

/* Cartão de QR do aluno, desenhado em canvas.
   Serve à professora (imprimir/enviar por aluno) e ao próprio aluno
   (baixar o seu no app). Mesmo desenho nos dois lados. */

const FONTE = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif'

function ajustarFonte(c, txt, maxW, tamInicial, peso) {
  let t = tamInicial
  for (;;) {
    c.font = `${peso} ${t}px ${FONTE}`
    if (c.measureText(txt).width <= maxW || t <= 13) break
    t -= 1
  }
}

export function desenharCartao(aluno, turma) {
  const W = 640, H = 880
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d')
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H)
  c.strokeStyle = '#1f4e79'; c.lineWidth = 8; c.strokeRect(18, 18, W - 36, H - 36)
  c.textAlign = 'center'

  c.fillStyle = '#1f4e79'; c.font = `800 36px ${FONTE}`
  c.fillText('Orbe', W / 2, 86)
  c.fillStyle = '#5b6069'; c.font = `500 20px ${FONTE}`
  c.fillText('Topografia · IFPE', W / 2, 116)

  const lado = 420
  const qr = makeQRCanvas(`${QR_PREFIX};${turma.id};${aluno.id}`, lado)
  if (qr) c.drawImage(qr, (W - lado) / 2, 150, lado, lado)

  let y = 150 + lado + 62
  c.fillStyle = '#1a1c1f'; ajustarFonte(c, aluno.nome, W - 90, 34, '700')
  c.fillText(aluno.nome, W / 2, y)
  if (aluno.matricula) {
    y += 40; c.fillStyle = '#5b6069'; c.font = `500 24px ${FONTE}`
    c.fillText('Mat. ' + aluno.matricula, W / 2, y)
  }
  if (turma.nome) {
    y += 36; c.fillStyle = '#5b6069'; ajustarFonte(c, turma.nome, W - 90, 20, '500')
    c.fillText(turma.nome, W / 2, y)
  }

  c.fillStyle = '#8a9099'; c.font = `500 17px ${FONTE}`
  c.fillText('Mostre este QR para a professora registrar sua presença', W / 2, H - 46)
  return cv
}

export function nomeArquivo(aluno) {
  const base = String(aluno.matricula || aluno.nome).replace(/[^\w\-. ]+/g, '').trim()
  return `QR ${base}.png`
}

export function baixarCartao(aluno, turma) {
  desenharCartao(aluno, turma).toBlob(b => {
    const url = URL.createObjectURL(b)
    const a = document.createElement('a'); a.href = url; a.download = nomeArquivo(aluno)
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }, 'image/png')
}

/* No celular, compartilhar é melhor que baixar: abre a folha do sistema e
   permite salvar em Fotos ou mandar pelo WhatsApp. Onde não existe, baixa. */
export function compartilharCartao(aluno, turma, aoFalhar) {
  desenharCartao(aluno, turma).toBlob(async b => {
    try {
      const f = new File([b], nomeArquivo(aluno), { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: 'QR de ' + aluno.nome })
        return
      }
    } catch (e) { if (e && e.name === 'AbortError') return }
    aoFalhar && aoFalhar()
  }, 'image/png')
}
