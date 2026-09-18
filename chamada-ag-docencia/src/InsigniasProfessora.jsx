import React, { useCallback, useEffect, useMemo, useState } from 'react'
import * as store from './lib/store'
import { INSIGNIAS, CATEGORIAS, POR_CHAVE, TOTAL, arte, ehPioneira } from './lib/insignias'
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

  const [pioneiros, setPioneiros] = useState([])
  const [geral, setGeralRaw] = useState(() => { try { return localStorage.getItem('orbe_ins_geral') === '1' } catch (e) { return false } })
  const setGeral = v => { setGeralRaw(v); try { localStorage.setItem('orbe_ins_geral', v ? '1' : '0') } catch (e) {} }
  const [listaGeral, setListaGeral] = useState([])
  const carregar = useCallback(() => {
    if (!online || !tid) return
    let vale = true   // resposta atrasada de outra turma não sobrescreve a atual
    setLista([]); setPioneiros([])
    store.insigniasDaTurma(tid).then(d => { if (vale) setLista(d) }).catch(e => showToast('Erro: ' + e.message))
    store.pioneirosDaTurma(tid).then(d => { if (vale) setPioneiros(d) }).catch(() => { if (vale) setPioneiros([]) })
    return () => { vale = false }
  }, [tid, online, showToast])
  useEffect(() => {
    if (!online || !geral) return
    let vale = true
    Promise.all(turmas.map(t => store.insigniasDaTurma(t.id).then(d => d.map(i => ({ ...i, turma_id: t.id })))))
      .then(ds => { if (vale) setListaGeral(ds.flat()) }).catch(e => showToast('Erro: ' + e.message))
    return () => { vale = false }
  }, [geral, turmas, online, showToast, lista])
  async function passarAdiante(p) {
    const nome = POR_CHAVE['pioneiro_' + p.base]?.nome
    if (!confirm(`Tirar "${nome}" de ${p.confirmado.nome} e passar ao próximo da turma?`)) return
    try { await store.decidirPioneiro(tid, p.base, p.confirmado.aluno_id, 'desfazer'); showToast('Passou ao próximo'); carregar() }
    catch (e) { showToast('Erro: ' + e.message) }
  }
  useEffect(() => { setAberto(null); return carregar() }, [carregar])

  const porAluno = useMemo(() => {
    const m = {}
    lista.forEach(i => { (m[i.aluno_id] = m[i.aluno_id] || []).push(i) })
    return m
  }, [lista])
  const curto = t => (t?.nome || '').split(' (')[0].split(' — ').pop()
  const visao = geral ? listaGeral : lista
  const todosAlunos = useMemo(() => {
    const m = {}
    turmas.forEach(t => (t.alunos || []).forEach(a => { m[a.id] = { nome: a.nome, turma: curto(t) } }))
    return m
  }, [turmas])
  const quantos = useMemo(() => {
    const m = {}
    visao.forEach(i => { if (!ehPioneira(i.chave)) m[i.chave] = (m[i.chave] || 0) + 1 })
    return m
  }, [visao])
  const semana = useMemo(() => {
    const corte = Date.now() - 7 * 86400000
    const m = {}
    visao.filter(i => new Date(i.concedida_em).getTime() >= corte).forEach(i => {
      const a = todosAlunos[i.aluno_id]
      if (a) (m[i.chave] = m[i.chave] || []).push(geral ? `${primeiro(a.nome)} (${a.turma})` : primeiro(a.nome))
    })
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length)
  }, [visao, todosAlunos, geral])

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
        <div className="btnrow">
          <button className={'btn mini' + (geral ? ' ghost' : '')} onClick={() => setGeral(false)}>Esta turma</button>
          <button className={'btn mini' + (geral ? '' : ' ghost')} onClick={() => setGeral(true)}>Todas as turmas</button>
        </div>
        {geral && <p className="note">"Insígnias da semana" e "Quantos têm cada uma" mostram todas as turmas: {visao.length} concedida(s). Pioneiros e "Por aluno" continuam só desta turma.</p>}
        <p className="note">Nesta turma: {lista.length} concedida(s) · {Object.keys(porAluno).length} de {alunos.length} alunos têm pelo menos uma.</p>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Insígnias da semana · {geral ? 'todas as turmas' : curto(turma)}</h2>
        <p className="hint">Pela data em que a insígnia foi entregue. As retroativas (regra nova valendo para trás) entram na semana em que a regra foi ligada.</p>
        {semana.length === 0 ? <p className="empty">Nada nos últimos 7 dias. Toque em "Conferir regras agora".</p> : <>
          {semana.map(([chave, nomes]) => <div className="ins-linha" key={chave}>
            <img src={arte(chave)} alt="" />
            <div><b>{POR_CHAVE[chave]?.nome || chave}</b><div className="muted-x">{nomes.slice(0, 8).join(', ')}{nomes.length > 8 ? ` e mais ${nomes.length - 8}` : ''}</div></div>
          </div>)}
          <p className="note">Projete esta lista. Só quem ganhou aparece: ninguém é listado por não ter.</p>
        </>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Pioneiros da turma</h2>
        <p className="hint">O primeiro da turma a estrear cada função ganha a versão Pioneiro, sozinho (o servidor confere a cada 5 minutos).
          Se não valer, passe ao próximo: quem vem depois na ordem ganha.</p>
        {pioneiros.map(p => { const ins = POR_CHAVE['pioneiro_' + p.base]
          return <div className="ins-linha" key={p.base}>
            <img src={arte('pioneiro_' + p.base)} alt="" style={p.confirmado ? null : { opacity: .35 }} />
            <div style={{ flex: 1 }}><b>{ins?.nome || p.base}</b>
              <div className="muted-x">{p.confirmado ? <>{p.confirmado.nome} · {fmt(p.confirmado.feito_em)}</>
                : p.candidato ? <>ainda não entregue · próximo: {primeiro(p.candidato.nome)}</> : 'ninguém estreou ainda'}</div></div>
            {p.confirmado && <button className="btn ghost mini" onClick={() => passarAdiante(p)}>Passar ao próximo</button>}
          </div> })}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Quantos têm cada uma · {geral ? 'todas as turmas' : curto(turma)}</h2>
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
                <span className="left"><Avatar a={a} tam="mini" /><span className="who"><span>{a.nome}</span><span className="m">{dele.filter(i => !ehPioneira(i.chave)).length} de {TOTAL}</span></span></span>
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
