import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { arquivoParaJpeg } from './lib/foto'
import { gravarSelfie, useSelfieGuardada } from './lib/selfie'
import Avatar from './Avatar.jsx'

/* Selfie do próprio aluno. Fica pequena (160 px) e vai por salvar_selfie para a linha
   dele em `alunos` — a professora vê na lista e no radar sem fazer nada.

   Regra dela (26/09/2026, substitui a de 16/09): o aluno troca a selfie quando quiser.
   Trocar é sempre substituir — a nova entra no lugar da antiga, nunca fica sem foto.
   Sem rede: a nova fica "a enviar" e a antiga continua valendo até ela subir. */

export default function MinhaFoto({ ident, online, pedir, jaEnviada, onEnviada, onTrocarAvatar }) {
  // a selfie mora em lib/selfie: esta tela grava lá, e o resto do app lê de lá como avatar
  const minha = useSelfieGuardada(ident)
  const [rascunho, setRascunho] = useState(null)      // foto escolhida, ainda não enviada
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const fileRef = useRef(null)
  // o servidor manda (jaEnviada true/false); sem essa informação, vale o que o celular lembra
  const temEnviada = jaEnviada === true || !!(minha && minha.enviada)
  const pendente = minha && !minha.enviada ? minha : null

  async function enviar(src) {
    const { data, error } = await supabase.rpc('salvar_selfie', { p_matricula: ident.matricula || '', p_aluno_id: ident.alunoId || null, p_foto: src })
    if (error) throw error
    if (!data?.ok) { const e = new Error(data?.erro || 'não aceitou a foto'); e.recusada = true; throw e }
    if (onEnviada) onEnviada()   // a selfie vale insígnia: confere na hora
  }

  // ficou pendente sem rede → envia quando a rede volta
  useEffect(() => {
    if (!online || !pendente) return
    enviar(pendente.src).then(() => gravarSelfie({ ...pendente, enviada: true }))
      .catch(e => { if (e.recusada) setErro(e.message) })
  }, [online, pendente && pendente.em, ident && ident.alunoId])

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
    if (temEnviada && !confirm('Esta foto vai substituir a sua selfie atual. Enviar?')) return
    setBusy(true); setErro('')
    const v = { alunoId: ident.alunoId, src: rascunho, enviada: false, em: new Date().toISOString() }
    try {
      if (online) { await enviar(rascunho); v.enviada = true }
      else setErro('Sem rede agora. A foto fica no celular e é enviada quando a conexão voltar.')
      gravarSelfie(v); setRascunho(null)
    } catch (er) {
      if (er.recusada) setErro(er.message)   // a selfie atual continua valendo
      else { gravarSelfie(v); setRascunho(null); setErro('Não consegui enviar agora. Tento de novo quando houver rede.') }
    } finally { setBusy(false) }
  }

  if (!ident) return null
  const mostrar = rascunho || (minha && minha.src)
  return (
    <div className={'panel' + (pedir && !mostrar && !temEnviada ? ' selfie-pedir' : '')}>
      <div className="selfie-row">
        <div className="selfie-col">
          <div className="selfie-prev">{mostrar ? <img src={mostrar} alt="" /> : <span>{(ident.nome || '?')[0]}</span>}</div>
          <button className="selfie-av" onClick={onTrocarAvatar} disabled={!onTrocarAvatar}>
            <Avatar nome={ident.nome} avatar={ident.avatar} />
            <span>{ident.avatar ? 'meu avatar' : 'escolher avatar'}</span>
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ marginTop: 0 }}>Minha foto</h2>
          <p className="hint">A <b>foto</b> é só para a professora — é como ela vê você na lista e no radar.
            O <b>avatar</b>, abaixo dela, é a sua cara para a turma: no app e nas missões em equipe.</p>
          {rascunho ? <>
            <div className="btnrow" style={{ alignItems: 'center' }}>
              <button className="btn" onClick={confirmar} disabled={busy}>{busy ? 'Enviando…' : '✓ Enviar esta foto'}</button>
              <button className="btn ghost" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>📷 Tirar outra</button>
            </div>
            {temEnviada && <p className="note">Ela entra no lugar da selfie atual.</p>}
          </> : <>
            <div className="btnrow" style={{ alignItems: 'center' }}>
              <button className="btn" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy}>
                {busy ? 'Processando…' : pendente ? '📷 Trocar a foto a enviar' : temEnviada ? '📷 Trocar selfie' : '📷 Tirar selfie'}
              </button>
              {pendente ? <span className="badge off">a enviar</span> : temEnviada && <span className="badge on">enviada</span>}
            </div>
          </>}
          {erro && <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="user" hidden onChange={escolheu} />
    </div>
  )
}
