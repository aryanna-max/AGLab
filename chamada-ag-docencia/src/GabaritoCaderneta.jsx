import React, { useMemo, useState } from 'react'
import { gabarito, sugerirMedalhas, marcosOficiais, fmtM, fmtCm, fmtAz, TOL_CALCULO, TOL_FECHAMENTO, MEDALHA_OURO, MEDALHA_PRATA } from './lib/caderneta'
import { CroquiCaderneta } from './CadernetaAluno.jsx'

const CORES_EQ = ['#E8590C', '#1C7ED6', '#AE3EC9', '#2B8A3E', '#C2255C', '#0B7285']

/* Gabarito da caderneta — só a professora vê.
   O app refaz a conta de cada equipe a partir da própria caderneta dela e separa:
   · CAMPO: o fechamento no marco de controle (calculado pela caderneta × oficial);
   · CONTA: o que a equipe digitou × o que a caderneta dela dá.
   A sugestão de medalha é por critério (sugerirMedalhas): todas as equipes podem levar ouro. */

const NIVEL = { ouro: '🥇 Ouro', prata: '🥈 Prata', bronze: '🥉 Bronze' }
const fmtDH = iso => iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// unidades: [{ id, nome, entrega, alunoIds }] — equipes ou alunos
export function GabaritoResumo({ unidades, alvo, aplicar }) {
  const marcos = marcosOficiais()   // sem memo fixo: marco cadastrado (P1) pode chegar depois
  const linhas = useMemo(() => unidades.map(u => {
    const cad = u.entrega?.caderneta
    return { ...u, enviadaEm: u.entrega?.enviada_em || null, gab: cad ? gabarito(cad, marcos, alvo) : null }
  }), [unidades, marcos, alvo])
  const sug = useMemo(() => sugerirMedalhas(linhas), [linhas])
  const [busy, setBusy] = useState(false)

  // concordância entre as equipes no ponto novo: quanto os M0451A recalculados distam entre si
  const alvos = linhas.map(l => l.gab?.alvo).filter(Boolean)
  const espalho = alvos.length > 1 ? Math.max(...alvos.flatMap((a, i) => alvos.slice(i + 1).map(b => Math.hypot(a.n - b.n, a.e - b.e)))) : null
  const media = alvos.length ? { n: alvos.reduce((s, a) => s + a.n, 0) / alvos.length, e: alvos.reduce((s, a) => s + a.e, 0) / alvos.length } : null
  const comSugestao = linhas.filter(l => sug[l.id]?.nivel)

  async function aplicarTudo() {
    const plano = comSugestao.map(l => `${l.nome}: ${NIVEL[sug[l.id].nivel]}`).join('\n')
    if (!confirm(`Aplicar as medalhas sugeridas?\n\n${plano}\n\nVocê pode mudar qualquer uma depois.`)) return
    setBusy(true)
    try { for (const l of comSugestao) await aplicar(l, sug[l.id].nivel) } finally { setBusy(false) }
  }

  if (!linhas.some(l => l.gab)) return <div className="panel"><h2 style={{ marginTop: 0 }}>Gabarito da caderneta</h2><p className="note">Nenhuma caderneta anotada ainda. O gabarito aparece aqui assim que as equipes começarem a anotar.</p></div>

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Gabarito da caderneta · só você vê</h2>
      <p className="hint">O app refaz a conta de cada equipe <b>a partir da caderneta dela</b>. <b>Fechamento</b> = coordenada do marco de controle pela caderneta × coordenada oficial (é o campo). <b>Conta</b> = o que a equipe digitou × o que a caderneta dá (é o cálculo à mão; até {fmtCm(TOL_CALCULO)} é arredondamento).</p>
      <div className="scrollx"><table className="matrix gab-tab"><thead><tr><th className="nm">Equipe</th><th>envio</th><th>fechamento</th><th>conta {alvo}</th><th>conta controle</th><th>sugestão</th></tr></thead>
        <tbody>{linhas.map(l => { const g = l.gab, s = sug[l.id]
          const fech = g?.fechamento
          return <tr key={l.id}>
            <td className="nm">{l.nome}</td>
            <td>{l.enviadaEm ? fmtDH(l.enviadaEm) : g ? 'anotando' : '—'}</td>
            <td className={fech == null ? '' : fech <= TOL_FECHAMENTO ? 'P' : 'F'}>{fech == null ? '—' : fmtCm(fech)}{g?.ctrl ? <span className="m"> {g.ctrl.nome}</span> : ''}</td>
            <td className={!g?.contaAlvo ? '' : g.contaAlvo.dist <= TOL_CALCULO ? 'P' : 'F'}>{g?.contaAlvo ? fmtCm(g.contaAlvo.dist) : '—'}</td>
            <td className={!g?.contaCtrl ? '' : g.contaCtrl.dist <= TOL_CALCULO ? 'P' : 'F'}>{g?.contaCtrl ? fmtCm(g.contaCtrl.dist) : '—'}</td>
            <td>{s?.nivel && <b>{NIVEL[s.nivel]} </b>}<span className="m">{s?.motivo}</span></td>
          </tr> })}</tbody></table></div>
      <CroquiCaderneta titulo="Croqui das equipes" marcos={marcos} alvo={alvo}
        camadas={linhas.filter(l => l.gab).map((l, i) => ({ calc: l.gab.calc, cor: CORES_EQ[i % CORES_EQ.length], rotulo: l.nome }))} />
      {espalho != null && <p className="note">{alvo} pelas cadernetas: média N {fmtM(media.n)} · E {fmtM(media.e)} · as equipes diferem entre si em até <b>{fmtCm(espalho)}</b>.</p>}
      <p className="note">Critério (não é ranking: todas podem levar ouro): 🥇 fechou num marco de controle a até {fmtCm(MEDALHA_OURO)} e a conta à mão confere · 🥈 fechou a até {fmtCm(MEDALHA_PRATA)}, ou a até {fmtCm(MEDALHA_OURO)} com a conta errada (aí cabe <b>Refazer</b>) · 🥉 caderneta completa e {alvo} calculado, sem controle ou acima de {fmtCm(MEDALHA_PRATA)}. O controle vale em qualquer etapa; a posição dele entra na devolutiva, não na medalha. Sem envio, sem medalha.</p>
      {comSugestao.length > 0 && <div className="btnrow"><button className="btn" disabled={busy} onClick={aplicarTudo}>{busy ? 'Aplicando…' : 'Aplicar medalhas sugeridas'}</button></div>}
    </div>
  )
}

/* Detalhe de uma equipe: cada visada refeita, os pontos novos, a conferência da ré e os problemas. */
export function GabaritoDetalhe({ entrega, alvo }) {
  const [aberto, setAberto] = useState(false)
  const marcos = marcosOficiais()   // sem memo fixo: marco cadastrado (P1) pode chegar depois
  const g = useMemo(() => entrega?.caderneta ? gabarito(entrega.caderneta, marcos, alvo) : null, [entrega, marcos, alvo])
  if (!g) return null
  const linhas = entrega.caderneta.linhas || []
  return <>
    <div className="btnrow" style={{ marginTop: 6 }}><button className="btn ghost mini" onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar a caderneta' : `📒 Caderneta e gabarito (${g.calc.linhas.length} visadas)`}</button></div>
    {aberto && <div className="gab-det">
      <div className="scrollx"><table className="aloc"><thead><tr><th>#</th><th>estação</th><th>visado</th><th>Hz</th><th>DH (m)</th><th>Az (app)</th><th>N (app)</th><th>E (app)</th></tr></thead>
        <tbody>{g.calc.linhas.map(l => { const bruta = linhas[l.i] || {}
          return <tr key={l.i}><td>{l.i + 1}{l.papel === 're' ? ' ré' : ''}</td><td>{l.est}</td><td>{l.pv}</td><td>{bruta.hz}</td><td>{bruta.dh}</td><td>{fmtAz(l.az)}</td><td>{fmtM(l.n)}</td><td>{fmtM(l.e)}</td></tr> })}</tbody></table></div>
      <table className="aloc" style={{ marginTop: 8 }}><thead><tr><th></th><th>N</th><th>E</th><th>diferença</th></tr></thead><tbody>
        <tr><td><b>{alvo}</b> · caderneta</td><td>{fmtM(g.alvo?.n)}</td><td>{fmtM(g.alvo?.e)}</td><td></td></tr>
        <tr><td>{alvo} · digitado</td><td>{g.digAlvo ? fmtM(g.digAlvo.n) : '—'}</td><td>{g.digAlvo ? fmtM(g.digAlvo.e) : '—'}</td><td>{g.contaAlvo ? fmtCm(g.contaAlvo.dist) : '—'}</td></tr>
        <tr><td><b>{g.ctrl?.nome || 'controle'}</b> · oficial</td><td>{fmtM(g.ctrl?.oficial.n)}</td><td>{fmtM(g.ctrl?.oficial.e)}</td><td></td></tr>
        <tr><td>{g.ctrl?.nome || 'controle'} · caderneta</td><td>{fmtM(g.ctrl?.n)}</td><td>{fmtM(g.ctrl?.e)}</td><td>fechamento {fmtCm(g.fechamento)}{g.ctrl ? ` (ΔN ${fmtCm(g.ctrl.dn)} · ΔE ${fmtCm(g.ctrl.de)})` : ''}</td></tr>
        <tr><td>{g.ctrl?.nome || 'controle'} · digitado</td><td>{g.digCtrl ? fmtM(g.digCtrl.n) : '—'}</td><td>{g.digCtrl ? fmtM(g.digCtrl.e) : '—'}</td><td>{g.contaCtrl ? `conta ${fmtCm(g.contaCtrl.dist)}` : '—'}</td></tr>
      </tbody></table>
      {g.calc.conferenciasRe.length > 0 && <p className="note">Conferência da ré (DH medida × DH das coordenadas): {g.calc.conferenciasRe.map(r => `${r.est}→${r.re} ${fmtCm(r.dif)}`).join(' · ')}</p>}
      {g.calc.pontos.length > 0 && <p className="note">Pontos novos: {g.calc.pontos.map(p => `${p.nome} (de ${p.est})`).join(', ')}</p>}
      {g.problemas.length > 0 && <ul className="cad-problemas">{g.problemas.map((p, i) => <li key={i}>{p}</li>)}</ul>}
    </div>}
  </>
}
