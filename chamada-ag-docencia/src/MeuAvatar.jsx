import React, { useState } from 'react'
import { AVATARES, arteAvatar, nomeAvatar, podeTrocar, fmtDia } from './lib/avatares'
import { salvarAvatar } from './lib/alunoApi'

/* "Meu avatar": o aluno escolhe a cara com que aparece no app dele e para os colegas.

   Regra dela (18/09/2026): pode trocar, mas com limite — uma troca por semana. A primeira
   escolha é livre. Quem manda no limite é o servidor (salvar_avatar); esta tela só mostra
   o que já dá para saber, para o aluno não escolher à toa e levar não. */

export default function MeuAvatar({ ident, online, onEscolhido, onVoltar }) {
  const atual = ident?.avatar || ''
  const { pode, proxima } = podeTrocar(atual, ident?.avatarEm)
  const [escolha, setEscolha] = useState(atual)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [erro, setErro] = useState('')

  async function salvar() {
    if (!escolha || escolha === atual) return
    if (atual && !confirm(`Trocar para ${nomeAvatar(escolha)}? Depois disso você só troca de novo daqui a uma semana.`)) return
    setBusy(true); setErro(''); setMsg('')
    try {
      const r = await salvarAvatar(ident, escolha)
      onEscolhido(r.avatar, r.avatar_em)
      setMsg(`Pronto. Você é ${nomeAvatar(r.avatar)} agora.`)
    } catch (e) {
      setErro(e.message || 'Não consegui salvar agora.')
      if (e.avatar) { setEscolha(e.avatar); onEscolhido(e.avatar, e.avatar_em) }
    } finally { setBusy(false) }
  }

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Meu avatar</h2>
      <p className="hint">
        É assim que você aparece no app e para os colegas nas missões em equipe e no pódio.
        {' '}A sua foto não vai para lugar nenhum disso: ela é só para a professora, na chamada.
      </p>

      <div className="ins-grade av-grade">
        {AVATARES.map(a => (
          <button key={a.k} className={'ins-it' + (escolha === a.k ? ' av-on' : '')}
            onClick={() => setEscolha(a.k)} aria-pressed={escolha === a.k}>
            <img src={arteAvatar(a.k, { tam: 256 })} alt="" width="64" height="64" />
            <span>{a.nome}{atual === a.k ? ' · seu' : ''}</span>
          </button>
        ))}
      </div>

      {!pode && <p className="note">Você trocou de avatar há pouco. A próxima troca abre em <b>{fmtDia(proxima)}</b>.</p>}
      {pode && atual && <p className="note">Trocar vale uma vez por semana — escolha com calma.</p>}
      {!atual && <p className="note">A primeira escolha é livre. Depois dela, uma troca por semana.</p>}

      <div className="btnrow">
        <button className="btn" onClick={salvar} disabled={busy || !escolha || escolha === atual || !pode || !online}>
          {busy ? 'Salvando…' : atual ? '✓ Trocar para este' : '✓ Usar este avatar'}
        </button>
        {onVoltar && <button className="btn ghost" onClick={onVoltar}>Voltar</button>}
      </div>
      {!online && <p className="note">Sem rede agora: a escolha precisa de conexão.</p>}
      {msg && <div className="flash ok" style={{ textAlign: 'left' }}>{msg}</div>}
      {erro && <p className="note" style={{ color: 'var(--miss)' }}>{erro}</p>}
    </div>
  )
}
