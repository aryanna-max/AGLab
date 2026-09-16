import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { arquivoParaJpeg } from './lib/foto'

/* Selfie do próprio aluno. Fica pequena (160 px, só o rosto) e vai por
   salvar_selfie para a linha dele em `alunos` — a professora vê na lista
   e no radar sem fazer nada. Sem rede: guarda no celular e envia depois. */

const K = 'agc2_selfie'   // {alunoId, src, enviada, em}
const ler = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') } catch (e) { return null } }
const gravar = v => { try { v ? localStorage.setItem(K, JSON.stringify(v)) : localStorage.removeItem(K) } catch (e) {} }

export default function MinhaFoto({ ident, online, pedir, onEnviada }) {
  const [sel, setSel] = useState(ler)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef(null)
  const minha = sel && ident && sel.alunoId === ident.alunoId ? sel : null

  async function enviar(src) {
    const { data, error } = await supabase.rpc('salvar_selfie', { p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null, p_foto: src })
    if (error) throw error
    if (!data?.ok) throw new Error(data?.erro || 'não aceitou a foto')
    if (onEnviada) onEnviada()   // a selfie vale insígnia: confere na hora
  }

  // ficou pendente sem rede → tenta quando a rede volta
  useEffect(() => {
    if (!online || !minha || minha.enviada) return
    enviar(minha.src).then(() => { const v = { ...minha, enviada: true }; gravar(v); setSel(v) }).catch(() => {})
  }, [online, minha && minha.enviada, ident && ident.alunoId])

  async function escolheu(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErro('')
    try {
      const src = await arquivoParaJpeg(f, { lado: 160, quadrado: true, qualidade: 0.72 })
      let enviada = false
      if (online) { try { await enviar(src); enviada = true } catch (er) { setErro('Guardei no celular. Envio quando houver rede.') } }
      else setErro('Sem rede agora. Guardei no celular e envio depois.')
      const v = { alunoId: ident.alunoId, src, enviada, em: new Date().toISOString() }
      gravar(v); setSel(v)
    } catch (er) { setErro('Não consegui ler a imagem. Tente de novo.') }
    finally { setBusy(false) }
  }

  if (!ident) return null
  return (
    <div className={'panel' + (pedir && !minha ? ' selfie-pedir' : '')}>
      <div className="selfie-row">
        <div className="selfie-prev">{minha ? <img src={minha.src} alt="" /> : <span>{(ident.nome || '?')[0]}</span>}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ marginTop: 0 }}>Minha foto</h2>
          <p className="hint">É como a professora vê você na lista e no radar.</p>
          <div className="btnrow" style={{ alignItems: 'center' }}>
            <button className="btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
              {busy ? 'Processando…' : minha ? '📷 Trocar foto' : '📷 Tirar selfie'}
            </button>
            {minha && !minha.enviada && <span className="badge off">envio pendente</span>}
            {minha && minha.enviada && <span className="badge on">enviada</span>}
          </div>
          {erro && <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={escolheu} />
    </div>
  )
}
