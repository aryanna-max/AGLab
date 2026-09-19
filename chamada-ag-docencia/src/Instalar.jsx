import React, { useEffect, useState } from 'react'
import { gravarPerfil } from './Escolha.jsx'
import { makeQRCanvas } from './lib/qr'

/* /instalar — a página do QR do material de instalação (pedido dela, 18/09/2026).
   Reconhece o aparelho e mostra só os passos dele:
   - já instalado (aberto pelo ícone) → manda entrar;
   - Android com Chrome → botão "Instalar agora" quando o navegador oferece; senão, menu ⋮;
   - iPhone → Safari, Compartilhar, Adicionar à Tela de Início (em outro navegador, pede o Safari);
   - navegador de dentro do WhatsApp/Instagram → abrir no navegador de verdade;
   - computador → QR para ler com o celular.
   Não marca presença nem pede matrícula: isso é na sala, durante a aula. */

const ua = navigator.userAgent || ''
const IOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const ANDROID = /Android/.test(ua)
const DENTRO_DE_APP = /FBAN|FBAV|Instagram|Line\/|; wv\)|WhatsApp/i.test(ua)
const IOS_OUTRO = IOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)
const INSTALADO = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
const LINK = `${location.origin}/instalar`

const Compartilhar = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-label="botão Compartilhar" style={{ verticalAlign: '-5px' }}>
    <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="#1a73e8" strokeWidth="2" strokeLinecap="round" />
  </svg>)
const Menu = () => <b style={{ display: 'inline-block', padding: '0 7px', border: '1px solid var(--line)', borderRadius: 6 }}>⋮</b>

function Passo({ n, children }) {
  return <li className="inst-passo"><span className="inst-n">{n}</span><div>{children}</div></li>
}

export default function Instalar() {
  const [prompt, setPrompt] = useState(null)
  const [instalou, setInstalou] = useState(INSTALADO())
  const [copiado, setCopiado] = useState(false)
  const [qr, setQr] = useState('')

  useEffect(() => {
    if (IOS || ANDROID) gravarPerfil('aluno')   // o ícone instalado abre direto no app do aluno
    const bip = e => { e.preventDefault(); setPrompt(e) }
    const ok = () => setInstalou(true)
    window.addEventListener('beforeinstallprompt', bip); window.addEventListener('appinstalled', ok)
    if (!IOS && !ANDROID) { const cv = makeQRCanvas(LINK, 220); if (cv) setQr(cv.toDataURL()) }
    return () => { window.removeEventListener('beforeinstallprompt', bip); window.removeEventListener('appinstalled', ok) }
  }, [])

  async function instalarAgora() {
    if (!prompt) return
    prompt.prompt()
    const r = await prompt.userChoice.catch(() => null)
    if (r?.outcome === 'accepted') setInstalou(true)
    setPrompt(null)
  }
  async function copiar() {
    try { await navigator.clipboard.writeText(LINK); setCopiado(true); setTimeout(() => setCopiado(false), 2500) } catch (e) {}
  }

  let corpo
  if (instalou) corpo = <>
    <div className="flash ok" style={{ textAlign: 'left' }}>O Orbe já está instalado neste celular.</div>
    <ol className="inst-lista">
      <Passo n="1">Abra pelo <b>ícone do Orbe</b> na tela do celular.</Passo>
      <Passo n="2">Toque em <b>Sou aluno</b> e informe a sua <b>matrícula</b>.</Passo>
      <Passo n="3">Na tela inicial, toque em <b>Ativar avisos da professora</b> e aceite.</Passo>
    </ol>
    <button className="btn" onClick={() => { location.href = '/' }}>Entrar no Orbe</button>
  </>
  else if (DENTRO_DE_APP) corpo = <>
    <div className="flash dup" style={{ textAlign: 'left' }}>Você abriu o link <b>por dentro de outro app</b> (WhatsApp, Instagram…). Daqui não dá para instalar.</div>
    <ol className="inst-lista">
      {IOS
        ? <Passo n="1">Toque em <Compartilhar /> ou em <b>⋯</b> e escolha <b>Abrir no Safari</b>.</Passo>
        : <Passo n="1">Toque em <Menu /> e escolha <b>Abrir no Chrome</b> (ou "Abrir no navegador").</Passo>}
      <Passo n="2">Na página que abrir, siga os passos de instalação.</Passo>
    </ol>
    <button className="btn ghost" onClick={copiar}>{copiado ? 'Link copiado ✓' : 'Copiar o link'}</button>
  </>
  else if (IOS) corpo = <>
    {IOS_OUTRO && <div className="flash dup" style={{ textAlign: 'left' }}>No iPhone, instale pelo <b>Safari</b>. Copie o link e cole no Safari.
      <div style={{ marginTop: 8 }}><button className="btn ghost mini" onClick={copiar}>{copiado ? 'Link copiado ✓' : 'Copiar o link'}</button></div></div>}
    <ol className="inst-lista">
      <Passo n="1">No Safari, toque em <Compartilhar /> <b>Compartilhar</b>, na barra de baixo.</Passo>
      <Passo n="2">Role a lista e toque em <b>Adicionar à Tela de Início</b>.</Passo>
      <Passo n="3">Toque em <b>Adicionar</b>. O ícone do Orbe aparece na tela do celular.</Passo>
      <Passo n="4">Abra pelo <b>ícone</b> (não pelo Safari), toque em <b>Sou aluno</b> e informe a matrícula.</Passo>
      <Passo n="5">Toque em <b>Ativar avisos da professora</b> e aceite. No iPhone os avisos só funcionam no app aberto pelo ícone.</Passo>
    </ol>
  </>
  else if (ANDROID) corpo = <>
    {prompt && <button className="btn" style={{ width: '100%', fontSize: 18, padding: '14px' }} onClick={instalarAgora}>📲 Instalar agora</button>}
    <ol className="inst-lista">
      {prompt
        ? <Passo n="1">Toque em <b>Instalar agora</b>, acima, e confirme.</Passo>
        : <Passo n="1">No Chrome, toque em <Menu /> (canto de cima) e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</Passo>}
      <Passo n="2">Abra pelo <b>ícone do Orbe</b>, toque em <b>Sou aluno</b> e informe a matrícula.</Passo>
      <Passo n="3">Toque em <b>Ativar avisos da professora</b> e aceite.</Passo>
    </ol>
  </>
  else corpo = <>
    <p>O Orbe é um app de <b>celular</b>. Aponte a câmera do celular para este QR:</p>
    {qr && <img src={qr} alt="QR para abrir esta página no celular" width="220" height="220" style={{ display: 'block', margin: '8px auto' }} />}
    <p className="note" style={{ textAlign: 'center' }}>{LINK}</p>
  </>

  return (
    <div className="wrap">
      <div className="marca turma">
        <img className="marca-turma" src="/orbe-turma.png" width="1120" height="606" alt="A turma do Orbe" />
        <h1 className="marca-nome">Instalar o Orbe</h1>
        <p className="marca-sub">Topografia · IFPE</p>
      </div>
      <div className="panel">{corpo}</div>
      <p className="note" style={{ textAlign: 'center' }}>A presença é marcada na sala, durante a aula.</p>
    </div>
  )
}
