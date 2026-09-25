import React, { useEffect, useState } from 'react'
import { fmtPrazo, marcarEtapa, enviarMissao, salvarRascunho, marcarVista, missaoVista } from './lib/alunoApi'
import Avatar from './Avatar.jsx'
import { EscolherEquipe, PainelCaderneta, useCaderneta } from './CadernetaAluno.jsx'
import { resumoTexto } from './lib/caderneta'

/* Missões do aluno: as que a professora lançou para a turma dele, com prazo,
   etapas (gravadas na hora), entrega, nível alcançado, devolutiva e ranking. */

const FRENTE = { planimetria: 'Planimetria', altimetria: 'Altimetria', planialtimetria: 'Planialtimetria', geral: 'Geral' }
const NIVEL = { ouro: '🥇 Ouro', prata: '🥈 Prata', bronze: '🥉 Bronze' }
const STATUS = { em_andamento: 'em andamento', enviada: 'enviada — aguardando a professora', aceita: 'aceita', refazer: 'refazer' }

export default function MissoesAluno({ ident, online, missoes, abrirId }) {
  const { dados, carregando, recarregar } = missoes
  const [abertaId, setAbertaId] = useState(abrirId || null)
  // chegou tocando num aviso de missão: abre direto nela
  useEffect(() => { if (abrirId) { marcarVista(abrirId); setAbertaId(abrirId) } }, [abrirId])
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const it = setInterval(() => setAgora(Date.now()), 30000); return () => clearInterval(it) }, [])

  const lista = dados?.missoes || []
  const atual = lista.find(m => m.lancamento_id === abertaId)
  if (atual) return <Detalhe m={atual} ident={ident} online={online} agora={agora} onVoltar={() => { setAbertaId(null); recarregar() }} recarregar={recarregar} />

  const abertas = lista.filter(m => m.aberta), encerradas = lista.filter(m => !m.aberta)
  const sem = dados?.semestre

  return (
    <>
      {sem && sem.podio && sem.podio.length > 0 && <div className="panel podio">
        <h2 style={{ marginTop: 0 }}>Ranking do semestre</h2>
        <div className="podio-row">{sem.podio.map((p, i) => <div key={i} className={'podio-it p' + i}><span className="pd-pos">{i + 1}º</span><Avatar nome={p.nome} avatar={p.avatar} tam="mini" /><span className="pd-nome">{p.nome}</span><span className="pd-pts">{p.pontos} pts</span></div>)}</div>
        <p className="note">{sem.meus_pontos > 0 ? <>Você tem <b>{sem.meus_pontos} pts</b> · {sem.minha_posicao}º de {sem.total}.</> : 'Complete uma missão para entrar no ranking.'} Ouro vale 3, prata 2, bronze 1.</p>
      </div>}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Missões abertas</h2>
        {!dados && <p className="note">{carregando ? 'Carregando…' : online ? 'Não consegui carregar agora.' : 'Sem rede: as missões aparecem quando a conexão voltar.'}</p>}
        {dados && abertas.length === 0 && <p className="empty">Nenhuma missão aberta. A professora lança no dia da aula.</p>}
        {abertas.map(m => <CardMissao key={m.lancamento_id} m={m} agora={agora} onAbrir={() => { marcarVista(m.lancamento_id); setAbertaId(m.lancamento_id) }} />)}
      </div>

      {encerradas.length > 0 && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Encerradas</h2>
        {encerradas.map(m => <CardMissao key={m.lancamento_id} m={m} agora={agora} onAbrir={() => setAbertaId(m.lancamento_id)} />)}
      </div>}
    </>
  )
}

function CardMissao({ m, agora, onAbrir }) {
  const pz = fmtPrazo(m.prazo_em, agora)
  const total = (m.etapas || []).length, feitas = Object.keys(m.minha?.etapas_feitas || {}).length
  const nova = m.aberta && !missaoVista(m.lancamento_id)
  return (
    <button className={'missao-card' + (pz.urgente ? ' urgente' : '') + (m.aberta ? '' : ' encerrada')} onClick={onAbrir}>
      <span className="mc-top"><span className="tag">{FRENTE[m.frente] || m.frente}</span>{m.em_equipe && <span className="tag equipe">{m.equipe ? m.equipe.nome : 'equipe'}</span>}{nova && <span className="tag nova">nova</span>}{m.minha?.nivel && <span className="tag nivel">{NIVEL[m.minha.nivel]}</span>}</span>
      <span className="mc-tit">{m.titulo}</span>
      <span className="mc-sub">{pz.texto}{total ? ` · ${feitas}/${total} etapas` : ''}{m.minha?.status ? ` · ${STATUS[m.minha.status] || m.minha.status}` : ''}</span>
    </button>
  )
}

const OBS = 'Observações: '
const rotulo = c => typeof c === 'string' ? c : (c?.rotulo || '')
function juntarCampos(campos, r) {
  const linhas = campos.map((c, i) => `${rotulo(c)}: ${String(r.v[i] || '').trim().replace(/\n+/g, ' ')}`)
  return (r.obs || '').trim() ? linhas.join('\n') + '\n' + OBS + r.obs.trim() : linhas.join('\n')
}
function lerCampos(campos, texto) {
  const v = campos.map(() => ''), t = texto || ''
  if (!campos.length || !t) return { v, obs: '' }
  const iObs = t.indexOf('\n' + OBS)
  const corpo = iObs >= 0 ? t.slice(0, iObs) : t, obs = iObs >= 0 ? t.slice(iObs + 1 + OBS.length) : ''
  corpo.split('\n').forEach(l => { const i = campos.findIndex(c => l.startsWith(rotulo(c) + ': ')); if (i >= 0) v[i] = l.slice(rotulo(campos[i]).length + 2) })
  return { v, obs }
}

function Detalhe({ m, ident, online, agora, onVoltar, recarregar }) {
  const [feitas, setFeitas] = useState(m.minha?.etapas_feitas || {})
  // rascunho no celular: a missão se faz por etapas, às vezes em dias diferentes; o que ele digitou não se perde até enviar
  const kRasc = 'orbe_rasc_' + m.lancamento_id
  // o que abre nos campos: o mais recente entre o rascunho deste celular e o salvo no servidor; se não houver, o que foi enviado
  const campos = m.campos || []
  const inicial = (() => {
    let local = null; try { local = JSON.parse(localStorage.getItem(kRasc) || 'null') } catch (e) {}
    const srv = m.minha?.rascunho != null && m.minha?.rascunho_em ? { texto: m.minha.rascunho, em: m.minha.rascunho_em } : null
    const enviadoDepois = t => m.minha?.enviada_em && (!t || m.minha.enviada_em > t)
    const cand = [local && !enviadoDepois(local.em) ? local : null, srv && !enviadoDepois(srv.em) ? srv : null].filter(Boolean)
      .sort((a, b) => (b.em || '').localeCompare(a.em || ''))[0]
    return cand ? cand.texto : (m.minha?.texto || '')
  })()
  const [texto, setTextoRaw] = useState(campos.length ? '' : inicial)
  // campos de resposta: o texto é "pergunta: resposta" por linha (+ observações), e volta aos campos ao reabrir
  const [resp, setRespRaw] = useState(() => lerCampos(campos, inicial))
  const [salvoEm, setSalvoEm] = useState(null)
  const guardar = t => { try { localStorage.setItem(kRasc, JSON.stringify({ texto: t, em: new Date().toISOString() })) } catch (e) {} }
  const setTexto = t => { setTextoRaw(t); guardar(t); setSalvoEm(null) }
  const setResp = f => setRespRaw(r => { const n = typeof f === 'function' ? f(r) : f; guardar(juntarCampos(campos, n)); setSalvoEm(null); return n })
  // missão com caderneta: a caderneta é da equipe e sincroniza sozinha; a caixa de texto vira "observações"
  const cfgCad = m.caderneta || null
  const cadHook = useCaderneta(m, ident, online)
  const textoFinal = cfgCad ? resumoTexto(cadHook.cad, cfgCad.alvo || 'ponto novo', texto) : campos.length ? juntarCampos(campos, resp) : texto
  const vazios = campos.filter((c, i) => !String(resp.v[i] || '').trim()).length
  const setV = (i, val) => setResp(r => ({ ...r, v: campos.map((_, j) => j === i ? val : (r.v[j] || '')) }))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const pz = fmtPrazo(m.prazo_em, agora)
  const etapas = m.etapas || []
  const status = m.minha?.status
  const semEquipe = m.em_equipe && !m.equipe
  // equipe: todos os celulares registram, mas só um envia. O envio é o oficial e é o que vale (reabre só com refazer)
  const equipeEnviou = m.em_equipe && !!m.minha?.enviada_em && status !== 'refazer'
  const podeEditar = status !== 'aceita' && !semEquipe && !equipeEnviou
  // em equipe, o que um colega marca aparece aqui: confere a cada 30 s com a tela aberta
  const feitasServidor = JSON.stringify(m.minha?.etapas_feitas || {})
  useEffect(() => { setFeitas(JSON.parse(feitasServidor)) }, [feitasServidor])
  useEffect(() => {
    if (!m.em_equipe || !online) return
    const it = setInterval(recarregar, 30000); return () => clearInterval(it)
  }, [m.em_equipe, online, recarregar])

  async function toggle(i) {
    if (!online) { setMsg({ tipo: 'err', t: 'Sem rede: a etapa precisa de conexão para ficar gravada.' }); return }
    const agoraFeita = !feitas[i]
    setFeitas(f => { const n = { ...f }; if (agoraFeita) n[i] = new Date().toISOString(); else delete n[i]; return n })
    try { const r = await marcarEtapa(ident, m.lancamento_id, i, agoraFeita); setFeitas(r.etapas_feitas || {}) }
    catch (e) { setMsg({ tipo: 'err', t: e.message }); setFeitas(f => { const n = { ...f }; if (agoraFeita) delete n[i]; else n[i] = true; return n }) }
  }
  async function salvar() {
    if (!online) { setMsg({ tipo: 'err', t: 'Sem rede: as respostas ficaram guardadas neste celular. Salve de novo quando tiver sinal.' }); return }
    setBusy(true); setMsg(null)
    try { if (cfgCad && cadHook.sujo) await cadHook.salvar(); await salvarRascunho(ident, m.lancamento_id, textoFinal); setSalvoEm(new Date()) }
    catch (e) { setMsg({ tipo: 'err', t: e.message }) } finally { setBusy(false) }
  }
  async function enviar() {
    if (m.em_equipe) {
      const faltam = etapas.length - Object.keys(feitas).length
      const aviso = (faltam > 0 ? `Ainda faltam ${faltam} etapa(s).\n\n` : '') + 'Este envio é o oficial da equipe. Depois de enviado, é o que vale: ninguém da equipe envia de novo.\n\nConferiram juntos?'
      if (!confirm(aviso)) return
    }
    if (!m.em_equipe && vazios > 0 && !confirm(`Faltam ${vazios} resposta(s). Enviar assim mesmo?`)) return
    setBusy(true); setMsg(null)
    try {
      // a caderneta sobe antes do envio: é ela que a professora confere
      if (cfgCad && cadHook.sujo && !(await cadHook.salvar())) { setMsg({ tipo: 'err', t: 'A caderneta não foi salva (veja o aviso nela). Resolva e envie de novo.' }); return }
      const r = await enviarMissao(ident, m.lancamento_id, textoFinal)
      try { localStorage.removeItem(kRasc) } catch (e) {}
      setMsg(r.fora_do_prazo ? { tipo: 'dup', t: 'Enviada fora do prazo. Ficou registrada e a professora decide.' } : { tipo: 'ok', t: m.em_equipe ? 'Envio oficial da equipe registrado.' : 'Missão enviada.' })
      recarregar()
    } catch (e) { setMsg({ tipo: 'err', t: e.message }) } finally { setBusy(false) }
  }

  const nFeitas = Object.keys(feitas).length
  return (
    <>
      <div className="panel">
        <div className="btnrow" style={{ marginTop: 0 }}><button className="btn ghost mini" onClick={onVoltar}>↩ Missões</button></div>
        <span className="tag">{FRENTE[m.frente] || m.frente}</span>
        <h2 style={{ marginTop: 6 }}>{m.titulo}</h2>
        <p className={'hint prazo' + (pz.urgente ? ' urgente' : '') + (pz.vencido ? ' vencido' : '')}>⏱ {pz.texto}</p>
        {m.descricao && <p style={{ whiteSpace: 'pre-wrap' }}>{m.descricao}</p>}
      </div>

      {m.em_equipe && (semEquipe
        ? m.equipes_livres ? <EscolherEquipe m={m} ident={ident} online={online} recarregar={recarregar} />
          : <div className="panel"><h2 style={{ marginTop: 0 }}>Missão em equipe</h2><p className="note">A professora ainda não colocou você numa equipe. Quando ela formar as equipes, a sua aparece aqui.</p></div>
        : <Equipe m={m} extra={m.equipes_livres && podeEditar ? <EscolherEquipe m={m} ident={ident} online={online} recarregar={recarregar} jaNaEquipe /> : null} />)}

      {etapas.length > 0 && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Etapas · {nFeitas}/{etapas.length}</h2>
        <ul className="etapas">
          {etapas.map((e, i) => <li key={i} className={feitas[i] ? 'feita' : ''}>
            <label><input type="checkbox" checked={!!feitas[i]} disabled={!podeEditar} onChange={() => toggle(i)} /> <span>{e}</span></label>
          </li>)}
        </ul>
        <p className="note">Cada etapa marcada fica gravada no servidor na hora.</p>
      </div>}

      {cfgCad && !semEquipe && <PainelCaderneta m={m} cadHook={cadHook} podeEditar={podeEditar} />}

      {m.medalha && <MedalhaAuto m={m} />}

      {m.niveis && (m.niveis.bronze || m.niveis.prata || m.niveis.ouro) && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Níveis</h2>
        <ul className="niveis-lista">
          {['bronze', 'prata', 'ouro'].filter(k => m.niveis[k]).map(k => <li key={k} className={m.minha?.nivel === k ? 'meu' : ''}><b>{NIVEL[k]}</b> · {m.niveis[k]}</li>)}
        </ul>
      </div>}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Entrega</h2>
        {m.entrega && <p className="hint">{m.entrega}</p>}
        {status && <p className="note">Situação: <b>{STATUS[status] || status}</b>{m.minha?.enviada_em ? ` · enviada ${new Date(m.minha.enviada_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : ''}{m.minha?.enviada_por && m.em_equipe ? ` por ${m.minha.enviada_por}` : ''}{m.minha?.fora_do_prazo ? ' · fora do prazo' : ''}</p>}
        {equipeEnviou && <div className="devolutiva"><b>📱 Envio oficial da equipe, {m.minha.enviada_por_mim ? 'pelo seu celular' : `pelo celular de ${m.minha.enviada_por || 'um colega'}`}</b><p>{m.minha.texto || '(sem texto)'}</p><p className="note" style={{ margin: '6px 0 0' }}>É o que vale. Só a professora pode pedir para refazer.</p></div>}
        {m.em_equipe && podeEditar && <p className="note">Todos da equipe podem marcar etapas. Só um celular envia, e esse envio é o oficial: conferam juntos antes, porque depois de enviado é o que vale.</p>}
        {m.minha?.nivel && <p className="nivel-grande">{NIVEL[m.minha.nivel]}</p>}
        {m.minha?.devolutiva && <div className="devolutiva"><b>Devolutiva da professora</b><p>{m.minha.devolutiva}</p></div>}
        {podeEditar && <>
          {campos.length > 0 ? <>
            {campos.map((c, i) => <div key={i} className="campo-resp">
              <label className="fld">{i + 1}. {rotulo(c)}</label>
              {c?.tipo === 'caixas' ? (() => { const marcadas = String(resp.v[i] || '').split(', ').filter(Boolean)
                return <div className="caixas">{(c.opcoes || []).map(o => <label key={o} className="chk-inline"><input type="checkbox" checked={marcadas.includes(o)}
                  onChange={e => setV(i, (e.target.checked ? [...marcadas, o] : marcadas.filter(x => x !== o)).sort((a, b) => c.opcoes.indexOf(a) - c.opcoes.indexOf(b)).join(', '))} /> {o}</label>)}</div> })()
                : c?.tipo === 'texto' ? <textarea rows={3} value={resp.v[i] || ''} onChange={e => setV(i, e.target.value)} />
                : <input value={resp.v[i] || ''} onChange={e => setV(i, e.target.value)} />}
            </div>)}
            <label className="fld">Observações (opcional)</label>
            <textarea value={resp.obs} onChange={e => setResp(r => ({ ...r, obs: e.target.value }))} rows={2} placeholder="Algo que aconteceu em campo, nomes dos pins que você usou…" />
            <p className="note">💾 <b>Salvar</b> guarda as respostas para continuar depois, até em outro celular. A professora só vê quando você toca em <b>Enviar</b>.</p>
          </> : cfgCad ? <>
            <label className="fld">Observações (opcional)</label>
            <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2} placeholder="Algo que aconteceu em campo: estação refeita, prisma trocado, visada difícil…" />
            <p className="note">O envio leva a caderneta e as coordenadas calculadas (seções 1 e 2).</p>
          </> : <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={4} placeholder="Resultados, observações, nomes dos pins e poligonais que você usou…" />}
          <div className="btnrow">
            <button className="btn ghost" onClick={salvar} disabled={busy || !online}>💾 Salvar</button>
            <button className="btn" onClick={enviar} disabled={busy || !online}>{busy ? 'Enviando…' : m.em_equipe ? (status === 'refazer' ? 'Enviar de novo pela equipe' : 'Enviar pela equipe') : status === 'enviada' || status === 'refazer' ? 'Enviar de novo' : 'Enviar missão'}</button>
          </div>
          {salvoEm && <p className="note">✓ Salvo às {salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Ainda não foi enviado.</p>}
          {pz.vencido && <p className="note">O prazo passou. Ainda dá para enviar: fica marcado como fora do prazo e a professora decide.</p>}
        </>}
        {msg && <div className={'flash ' + msg.tipo} style={{ textAlign: 'left' }}>{msg.t}</div>}
      </div>

      {m.ranking && <div className="panel">
        <h2 style={{ marginTop: 0 }}>Ranking da missão</h2>
        <p className="hint">{m.ranking.enviadas} entrega(s) · 🥇 {m.ranking.ouro.length} · 🥈 {m.ranking.prata} · 🥉 {m.ranking.bronze}</p>
        {m.ranking.ouro.length > 0 && <p className="note">No ouro: <b>{m.ranking.ouro.join(', ')}</b></p>}
      </div>}
    </>
  )
}

/* Medalha automática: o servidor mede cada pin com o nome do marco e guarda o melhor até o prazo. */
function MedalhaAuto({ m }) {
  const md = m.medalha, a = m.minha?.medalha_auto, lim = md.limites || {}
  const fmt = v => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Medalha automática</h2>
      <p className="hint">Faça um pin em cima do marco <b>{md.marco}</b> (o nome do pin não importa: vale o lugar). O app mede a distância do pin até o marco e dá a medalha na hora. {md.vale === 'melhor' ? <>Pode tentar de novo: vale o seu <b>melhor pin</b> até o prazo.</> : <>Só vale o <b>primeiro pin</b> perto do marco: capriche antes de marcar.</>}</p>
      <p className="note">🥇 até {fmt(lim.ouro)} m · 🥈 até {fmt(lim.prata)} m · 🥉 até {fmt(lim.bronze)} m</p>
      {a ? <div className="devolutiva"><b>Seu {a.vale === 'melhor' ? 'melhor' : 'primeiro'} pin ficou a {fmt(a.erro)} m do marco</b>
          <p>{a.espalhamento != null && <>Espalhamento da ocupação: <b>{fmt(a.espalhamento)} m</b>{a.pin_nome ? ` · pin ${a.pin_nome}` : ''}<br /></>}{(m.minha?.nivel || a.nivel) ? NIVEL[m.minha?.nivel || a.nivel] : `Ainda sem medalha: precisa ficar a até ${fmt(lim.bronze)} m.`}{a.n_pins > 1 && a.vale === 'melhor' ? ` · ${a.n_pins} tentativas` : ''}</p></div>
        : <p className="note">Nenhum pin {md.marco} ainda.</p>}
    </div>
  )
}

/* A professora forma a equipe. Não há funções definidas: o aluno vê quem está com ele e quem fez o envio oficial. */
function Equipe({ m, extra }) {
  const eq = m.equipe
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>{eq.nome}</h2>
      <ul className="eq-membros">
        {(eq.membros || []).map((x, i) => { const enviou = m.minha?.enviada_em && (x.eu ? m.minha.enviada_por_mim : !m.minha.enviada_por_mim && x.nome === m.minha.enviada_por)
          return <li key={i} className={x.eu ? 'eu' : ''}><Avatar nome={x.nome} avatar={x.avatar} tam="mini" /><span style={{ flex: 1, minWidth: 0 }}>{enviou ? '📱 ' : ''}{x.nome}{x.eu ? ' (você)' : ''}</span>{enviou && <span className="fn">enviou</span>}</li> })}
      </ul>
      <p className="note">Sem funções definidas: dividam a atividade entre vocês. Todos os celulares registram; só um envia a missão.</p>
      {extra}
    </div>
  )
}
