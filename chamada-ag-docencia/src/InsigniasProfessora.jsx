import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'
import { INSIGNIAS, CATEGORIAS, POR_CHAVE, TOTAL, arte } from './lib/insignias'
import Avatar from './Avatar.jsx'

/* Insígnias — lado da professora.
   As automáticas saem das regras conferidas no servidor (presenças, pins, poligonais,
   leituras por ambiente, entregas de missão). Três são dadas por ela: Caderneta fechada,
   Olho de topógrafo e Parceiro de campo. Na projeção, só quem ganhou aparece. */

const DELA = INSIGNIAS.filter(i => i.daProfessora)
const fmt = iso => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''
const primeiro = n => (n || '').trim().split(' ')[0]

export default function InsigniasProfessora({ userId, tid, turmas, online, showToast }) {
  const turma = turmas.find(t => t.id === tid)
  const alunos = useMemo(() => (turma?.alunos || []).slice().sort((a, b) => a.nome.localeCompare(b.nome)), [turma])
  const [lista, setLista] = useState([])
  const [busy, setBusy] = useState(false)
  const [aberto, setAberto] = useState(null)      // aluno com o painel de conceder aberto
  const [dado, setDado] = useState('')

  const carregar = useCallback(() => {
    if (!online || !tid) return
    store.insigniasDaTurma(tid).then(setLista).catch(e => showToast('Erro: ' + e.message))
  }, [tid, online, showToast])
  useEffect(() => { carregar(); setAberto(null) }, [carregar])

  const porAluno = useMemo(() => {
    const m = {}
    lista.forEach(i => { (m[i.aluno_id] = m[i.aluno_id] || []).push(i) })
    return m
  }, [lista])
  const quantos = useMemo(() => {
    const m = {}
    lista.forEach(i => { m[i.chave] = (m[i.chave] || 0) + 1 })
    return m
  }, [lista])
  const semana = useMemo(() => {
    const corte = Date.now() - 7 * 86400000
    const m = {}
    lista.filter(i => new Date(i.concedida_em).getTime() >= corte).forEach(i => {
      const nome = alunos.find(a => a.id === i.aluno_id)?.nome
      if (nome) (m[i.chave] = m[i.chave] || []).push(primeiro(nome))
    })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length)
  }, [lista, alunos])

  async function conferir() {
    setBusy(true)
    try { const n = await store.conferirInsignias(tid); showToast(n ? `${n} insígnia(s) nova(s)` : 'Nenhuma insígnia nova'); carregar() }
    catch (e) { showToast('Erro: ' + e.message) } finally { setBusy(false) }
  }
  async function conceder(aluno, chave) {
    try { await store.concederInsignia(userId, aluno.id, chave, dado.trim() || null); showToast(`${POR_CHAVE[chave].nome} para ${primeiro(aluno.nome)}`); setDado(''); carregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }
  async function remover(i, aluno) {
    if (!confirm(`Tirar "${POR_CHAVE[i.chave]?.nome}" de ${aluno.nome}?`)) return
    try { await store.removerInsignia(i.id); showToast('Insígnia removida'); carregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }

  if (!turma) return null
  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Insígnias · {turma.nome.split(' (')[0]}</h2>
        <p className="hint">As automáticas são conferidas com os dados que já existem — vale retroativo. O aluno vê a insígnia no celular com o motivo concreto.</p>
        <div className="btnrow">
          <button className="btn" onClick={conferir} disabled={busy || !online}>{busy ? 'Conferindo…' : 'Conferir regras agora'}</button>
        </div>
        <p className="note">{lista.length} concedida(s) · {Object.keys(porAluno).length} de {alunos.length} alunos têm pelo menos uma.</p>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Insígnias da semana</h2>
        {semana.length === 0 ? <p className="empty">Nada nos últimos 7 dias. Toque em "Conferir regras agora".</p> : <>
          {semana.map(([chave, nomes]) => <div className="ins-linha" key={chave}>
            <img src={arte(chave)} alt="" />
            <div><b>{POR_CHAVE[chave]?.nome || chave}</b><div className="muted-x">{nomes.slice(0, 8).join(', ')}{nomes.length > 8 ? ` e mais ${nomes.length - 8}` : ''}</div></div>
          </div>)}
          <p className="note">Projete esta lista. Só quem ganhou aparece: ninguém é listado por não ter.</p>
        </>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Quantos têm cada uma</h2>
        <div className="ins-prof">
          {CATEGORIAS.map(([cat, nome, cor]) => <div key={cat}>
            <div className="fld" style={{ color: cor }}>{nome}</div>
            {INSIGNIAS.filter(i => i.cat === cat).map(i => <div key={i.k} className="ins-linha" style={{ borderBottom: 0, padding: '2px 0' }}>
              <img src={arte(i.k, { bloqueada: !quantos[i.k] })} style={{ width: 30, height: 30 }} alt="" />
              <div style={{ fontSize: 13 }}>{i.nome}<b style={{ marginLeft: 6 }}>{quantos[i.k] || 0}</b></div>
            </div>)}
          </div>)}
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Por aluno</h2>
        <p className="hint">Toque num aluno para dar uma insígnia sua: {DELA.map(i => i.nome).join(', ')}.</p>
        <ul className="people">
          {alunos.map(a => { const dele = porAluno[a.id] || []
            return <li key={a.id} style={{ display: 'block', cursor: 'pointer' }} onClick={() => { setAberto(aberto === a.id ? null : a.id); setDado('') }}>
              <div className="ent-cab">
                <span className="left"><Avatar a={a} tam="mini" /><span className="who"><span>{a.nome}</span><span className="m">{dele.length} de {TOTAL}</span></span></span>
                <span className="ins-chips">{dele.slice(0, 8).map(i => <img key={i.id} src={arte(i.chave)} title={POR_CHAVE[i.chave]?.nome} alt="" />)}</span>
              </div>
              {aberto === a.id && <div onClick={e => e.stopPropagation()}>
                <input value={dado} onChange={e => setDado(e.target.value)} placeholder="Motivo que o aluno vai ler (ex.: percebeu que o M0451 saiu do lugar)" />
                <div className="btnrow">
                  {DELA.map(i => <button key={i.k} className="btn mini" onClick={() => conceder(a, i.k)}>{i.nome}</button>)}
                </div>
                {dele.length > 0 && <div className="ins-chips" style={{ marginTop: 6 }}>
                  {dele.map(i => <button key={i.id} className="btn ghost mini" onClick={() => remover(i, a)} title={(i.dado || '') + ' · toque para tirar'}>
                    {POR_CHAVE[i.chave]?.nome || i.chave} · {fmt(i.concedida_em)} ✕</button>)}
                </div>}
              </div>}
            </li> })}
        </ul>
      </div>
    </>
  )
}
