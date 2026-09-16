import React from 'react'
import { fmtData, resumoFaltas } from './lib/alunoApi'

/* Área "Presença" do aluno: marcar a presença do dia (QR da aula + ocupação de 20 s)
   e acompanhar as datas e faltas. A presença só vale dentro da janela da aula — quem
   decide o que ficou fora é a professora. */

const ORIGEM = { chamada_aluno: 'pelo app', manual: 'marcada pela professora', qr_professora: 'marcada pela professora' }

export default function PresencaAluno({ historico, presencaHoje, online, onMarcar, foto }) {
  const { dados, carregando } = historico
  const r = resumoFaltas(dados)
  const hoje = dados?.hoje

  let estado, podeMarcar = true
  if (presencaHoje && !presencaHoje.fora) { estado = <>Presença de hoje registrada às <b>{presencaHoje.hora}</b>.</>; podeMarcar = false }
  else if (!online) estado = <>Sem rede agora. Dá para marcar: a leitura fica guardada e sobe depois.</>
  else if (!dados) estado = carregando ? 'Conferindo a aula de hoje…' : 'Não consegui conferir a aula de hoje.'
  else if (!hoje) { estado = <>Nenhuma aula aberta hoje para a sua turma.</>; podeMarcar = false }
  else if (hoje.aberta_agora) estado = <>Aula aberta · a presença vale até as <b>{hoje.fim}</b>.</>
  else {
    const [h, m] = hoje.inicio.split(':').map(Number), agora = new Date()
    const antes = agora.getHours() * 60 + agora.getMinutes() < h * 60 + m
    estado = antes ? <>A janela abre às <b>{hoje.inicio}</b> e vai até as {hoje.fim}.</> : <>A janela de hoje fechou às <b>{hoje.fim}</b>. Fale com a professora.</>
    podeMarcar = false
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Presença de hoje</h2>
        <p className="hint">{estado}</p>
        <div className="btnrow">
          <button className="btn" onClick={onMarcar} disabled={!podeMarcar}>📍 Marcar presença</button>
        </div>
        <p className="note">Leia o QR da aula e fique <b>20 segundos parado</b>: o app junta as leituras e envia a média. Só vale dentro do horário da aula.</p>
      </div>

      {/* a selfie mora aqui: é como a professora reconhece o aluno na chamada e no radar */}
      {foto}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Meu histórico</h2>
        {!dados ? <p className="note">{carregando ? 'Carregando…' : online ? 'Não consegui carregar agora.' : 'Sem rede: o histórico aparece quando a conexão voltar.'}</p> : <>
          <div className="count-strip">
            <div className="c ok"><div className="n">{r.presencas}</div><div className="l">presenças</div></div>
            <div className={'c' + (r.ausentes ? ' miss' : '')}><div className="n">{r.faltasHa}</div><div className="l">faltas (h-a)</div></div>
            <div className={'c' + (r.restamHa != null && r.restamHa <= r.tempos ? ' miss' : '')}><div className="n">{r.restamHa != null ? Math.max(0, r.restamHa) : '—'}</div><div className="l">h-a que ainda pode faltar</div></div>
          </div>
          <p className="note">Cada aula da sua turma vale <b>{r.tempos} h-a</b>. {r.limiteHa != null && <>O limite é de <b>{r.limiteHa} h-a</b> de falta ({dados.ch_ha} h-a no semestre, frequência mínima de 75%).</>}</p>
          {r.restamHa != null && r.restamHa <= r.tempos && r.restamHa >= 0 && <div className="flash dup" style={{ textAlign: 'left' }}>Atenção: mais uma falta e você chega ao limite.</div>}
          {r.restamHa != null && r.restamHa < 0 && <div className="flash err" style={{ textAlign: 'left' }}>Você passou do limite de faltas. Converse com a professora.</div>}

          {dados.aulas.length === 0 ? <p className="empty">Nenhuma aula registrada ainda.</p> :
            <ul className="people hist">
              {dados.aulas.map(a => <li key={a.data}>
                <span className="left"><span className="who"><span>{fmtData(a.data)}</span>
                  <span className="m">{a.presente ? `${ORIGEM[a.origem] || 'registrada'}${a.hora ? ' · ' + a.hora : ''}` : `falta · ${r.tempos} h-a`}{a.conteudo ? ' · ' + a.conteudo : ''}</span></span></span>
                <span className={'tag ' + (a.presente ? 'P' : 'F')}>{a.presente ? 'Presente' : 'Falta'}</span>
              </li>)}
            </ul>}
          <p className="note">Uma falta pode ser corrigida pela professora. Se você esteve na aula e aparece falta, fale com ela.</p>
        </>}
      </div>
    </>
  )
}
