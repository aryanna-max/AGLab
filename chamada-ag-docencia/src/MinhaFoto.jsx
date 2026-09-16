import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { arquivoParaJpeg } from './lib/foto'

/* Selfie do próprio aluno. Fica pequena (160 px) e vai por salvar_selfie para a linha
   dele em `alunos` — a professora vê na lista e no radar sem fazer nada.

   Regra dela (16/09/2026): antes de enviar, o aluno troca quantas vezes quiser; depois de
   enviada, não troca mais. Só a professora libera uma nova (Turmas & Fotos). O servidor
   também recusa uma segunda selfie. Sem rede: fica "a enviar" e ainda pode ser trocada. */

const K = 'agc2_selfie'   // {alunoId, src, enviada, em}
const ler = () => { try { return JSON.parse(localStorage.getItem(K) || 'null') } catch (e) { return null } }
const gravar = v => { try { v ? localStorage.setItem(K, JSON.stringify(v)) : localStorage.removeItem(K) } catch (e) {} }

export default function MinhaFoto({ ident, online, pedir, jaEnviada, onEnviada }) {
  const [sel, setSel] = useState(ler)
  const [rascunho, setRascunho] = useState(null)      // foto escolhida, ainda não enviada
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef(null)
  const minha = sel && ident && sel.alunoId === ident.alunoId ? sel : null
  // o servidor manda (jaEnviada true/false); sem essa informação, vale o que o celular lembra
  const travada = jaEnviada === true || (jaEnviada === undefined && !!(minha && minha.enviada))
  // a professora liberou uma nova selfie: esquece a antiga guardada no celular
  useEffect(() => { if (jaEnviada === false && minha && minha.enviada) { gravar(null); setSel(null) } }, [jaEnviada, minha && minha.enviada])
  const pendente = minha && !minha.enviada ? minha : null

  async function enviar(src) {
    const { data, error } = await supabase.rpc('salvar_selfie', { p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null, p_foto: src })
    if (error) throw error
    if (!data?.ok) { const e = new Error(data?.erro || 'não aceitou a foto'); e.travada = !!data?.travada; throw e }
    if (onEnviada) onEnviada()   // a selfie vale insígnia: confere na hora
  }

  // ficou pendente sem rede → envia quando a rede volta
  useEffect(() => {
    if (!online || !pendente || jaEnviada === true) return
    enviar(pendente.src).then(() => { const v = { ...pendente, enviada: true }; gravar(v); setSel(v) })
      .catch(e => { if (e.travada) { gravar(null); setSel(null); setErro(e.message) } })
  }, [online, pendente && pendente.em, ident && ident.alunoId, jaEnviada])

  async function escolheu(e) {
    const f = e.target.files && e.target.files[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErro('')
    try { setRascunho(await arquivoParaJpeg(f, { lado: 160, quadrado: true, qualidade: 0.72 })) }
    catch (er) { setErro('Não consegui ler a imagem. Tente de novo.') }
    finally { setBusy(false) }
  }

  async function confirmar() {
    if (!rascunho) return
    if (!confirm('Depois de enviada, a selfie não pode mais ser trocada. Enviar esta foto?')) return
    setBusy(true); setErro('')
    const v = { alunoId: ident.alunoId, src: rascunho, enviada: false, em: new Date().toISOString() }
    try {
      if (online) { await enviar(rascunho); v.enviada = true }
      else setErro('Sem rede agora. A foto fica no celular e é enviada quando a conexão voltar — até lá, ainda dá para trocar.')
      gravar(v); setSel(v); setRascunho(null)
    } catch (er) {
      if (er.travada) { setRascunho(null); setErro(er.message) }
      else { gravar(v); setSel(v); setRascunho(null); setErro('Não consegui enviar agora. Tento de novo quando houver rede — até lá, ainda dá para trocar.') }
    } finally { setBusy(false) }
  }

  if (!ident) return null
  const mostrar = rascunho || (minha && minha.src)
  return (
    <div className={'panel' + (pedir && !mostrar && !travada ? ' selfie-pedir' : '')}>
      <div className="selfie-row">
        <div className="selfie-prev">{mostrar ? <img src={mostrar} alt="" /> : <span>{(ident.nome || '?')[0]}</span>}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ marginTop: 0 }}>Minha foto</h2>
          <p className="hint">É como a professora vê você na lista e no radar.</p>
          {travada ? <>
            <div className="btnrow" style={{ alignItems: 'center' }}><span className="badge on">enviada</span></div>
            <p className="note">A selfie já foi enviada e não pode ser trocada. Se precisar, fale com a professora.</p>
          </> : rascunho ? <>
            <div className="btnrow" style={{ alignItems: 'center' }}>
              <button className="btn" onClick={confirmar} disabled={busy}>{busy ? 'Enviando…' : '✓ Enviar esta foto'}</button>
              <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>📷 Tirar outra</button>
            </div>
            <p className="note">Confira antes de enviar: depois, não dá para trocar.</p>
          </> : <>
            <div className="btnrow" style={{ alignItems: 'center' }}>
              <button className="btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
                {busy ? 'Processando…' : pendente ? '📷 Trocar a foto a enviar' : '📷 Tirar selfie'}
              </button>
              {pendente && <span className="badge off">a enviar</span>}
            </div>
          </>}
          {erro && <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={escolheu} />
    </div>
  )
}
