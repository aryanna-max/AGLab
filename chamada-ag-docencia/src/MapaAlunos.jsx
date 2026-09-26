import React, { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import * as store from './lib/store'
import { iniciais } from './Avatar.jsx'

/* Mapa dos alunos (pedido dela, 18/09/2026: "os alunos do radar em um mapa", separado do Radar).
   Mesmos dados do Radar (presenca_viva, batimento a cada poucos segundos de quem está com o app aberto),
   sobre um mapa de verdade: satélite (Esri) ou ruas (OpenStreetMap), com zoom e arrasto.
   - verde: mandou posição nos últimos 90 s — está com o Orbe aberto agora
   - cinza: esteve no app hoje, mas parou de transmitir (mostra a última posição e a hora)
   Círculo claro em volta de quem está verde = incerteza informada pelo GPS do celular.
   Referência da presença de hoje (quando a aula foi aberta com posição) aparece com o raio. */

const VIVO_S = 90
const BLOCO_F = [-8.0587608, -34.9512426]
const FUNDOS = {
  sat: { nome: 'Satélite', url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: 'Esri World Imagery', max: 19 },
  ruas: { nome: 'Ruas', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: '© OpenStreetMap', max: 19 },
}
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const hora = iso => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default function MapaAlunos({ tid, turmas, online }) {
  const t = turmas.find(x => x.id === tid)
  const pessoas = useMemo(() => Object.fromEntries([...(t?.alunos || []), ...(t?.auxiliares || [])].map(a => [a.id, a])), [t])
  const [vivos, setVivos] = useState([])
  const [ref, setRef] = useState(null)
  const [fundo, setFundo] = useState('sat')
  const [agora, setAgora] = useState(Date.now())
  const divRef = useRef(null), mapRef = useRef(null), camadaRef = useRef(null), fundoRef = useRef(null), enquadrou = useRef(false)

  // mapa: cria uma vez
  useEffect(() => {
    const m = L.map(divRef.current, { zoomControl: true, attributionControl: true }).setView(BLOCO_F, 18)
    camadaRef.current = L.layerGroup().addTo(m)
    mapRef.current = m
    setTimeout(() => m.invalidateSize(), 50)
    return () => { m.remove(); mapRef.current = null }
  }, [])
  useEffect(() => {
    const m = mapRef.current; if (!m) return
    if (fundoRef.current) m.removeLayer(fundoRef.current)
    const f = FUNDOS[fundo]
    fundoRef.current = L.tileLayer(f.url, { maxZoom: 21, maxNativeZoom: f.max, attribution: f.attr }).addTo(m)
  }, [fundo])

  // dados: a cada 5 s
  useEffect(() => {
    if (!tid || !online) return
    let vivo = true
    const puxa = async () => {
      try {
        const [v, r] = await Promise.all([store.vivos(tid), store.referenciaDeHoje(tid)])
        if (!vivo) return
        const hoje = hojeISO()
        setVivos((v || []).filter(x => x.lat != null && new Date(x.visto_em).toLocaleDateString('sv-SE') === hoje))
        setRef(r); setAgora(Date.now())
      } catch (e) {}
    }
    puxa(); enquadrou.current = false
    const it = setInterval(puxa, 5000)
    return () => { vivo = false; clearInterval(it) }
  }, [tid, online])

  // desenha
  useEffect(() => {
    const m = mapRef.current, c = camadaRef.current; if (!m || !c) return
    c.clearLayers()
    if (ref?.lat != null) {
      L.circle([ref.lat, ref.lon], { radius: ref.raio || 50, color: '#C9A227', weight: 2, dashArray: '6 6', fill: false }).addTo(c)
        .bindTooltip(`Referência da presença · raio ${ref.raio || 50} m`)
      L.circleMarker([ref.lat, ref.lon], { radius: 4, color: '#C9A227', fillOpacity: 1 }).addTo(c)
    }
    const pontos = []
    vivos.forEach(v => {
      const a = pessoas[v.aluno_id]; if (!a) return
      const aceso = (agora - new Date(v.visto_em).getTime()) / 1000 <= VIVO_S
      if (aceso && v.acuracia_m) L.circle([v.lat, v.lon], { radius: v.acuracia_m, color: '#2E8B57', weight: 1, fillOpacity: 0.08 }).addTo(c)
      const foto = a.foto ? `<img src="${esc(a.foto)}" alt="">` : `<span>${esc(iniciais(a.nome))}</span>`
      const nome = String(a.nome || '').trim().split(/\s+/)[0]
      const icon = L.divIcon({ className: 'mapa-aluno' + (aceso ? ' aceso' : '') + (a.papel === 'auxiliar' ? ' aux' : ''),
        html: `<div class="ma-bola">${foto}</div><div class="ma-nome">${esc(nome)}</div>`, iconSize: [44, 58], iconAnchor: [22, 22] })
      L.marker([v.lat, v.lon], { icon }).addTo(c)
        .bindPopup(`<b>${esc(a.nome)}</b><br>${aceso ? 'com o app aberto agora' : 'visto às ' + hora(v.visto_em)}${v.acuracia_m ? `<br>± ${Math.round(v.acuracia_m)} m` : ''}${a.papel === 'auxiliar' ? '<br>auxiliar' : ''}`)
      pontos.push([v.lat, v.lon])
    })
    if (!enquadrou.current && pontos.length) {
      enquadrou.current = true
      m.fitBounds(L.latLngBounds(pontos).pad(0.3), { maxZoom: 19 })
    }
  }, [vivos, ref, pessoas, agora])

  function enquadrar() {
    const m = mapRef.current; if (!m) return
    const pts = vivos.filter(v => pessoas[v.aluno_id]).map(v => [v.lat, v.lon])
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 19 }); else m.setView(BLOCO_F, 18)
  }

  const acesos = vivos.filter(v => pessoas[v.aluno_id] && (agora - new Date(v.visto_em).getTime()) / 1000 <= VIVO_S)
  const apagados = vivos.filter(v => pessoas[v.aluno_id] && !acesos.includes(v))
  if (!t) return null
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>🗺️ Mapa · {t.nome.split(' (')[0]}</h2>
      <div className="btnrow" style={{ marginTop: 0 }}>
        {Object.entries(FUNDOS).map(([k, f]) => <button key={k} className={'btn ghost mini' + (fundo === k ? ' on' : '')} onClick={() => setFundo(k)}>{f.nome}</button>)}
        <button className="btn ghost mini" onClick={enquadrar}>Enquadrar a turma</button>
        <span className="note" style={{ margin: 0 }}><b style={{ color: '#2E8B57' }}>{acesos.length}</b> com o app aberto agora · {apagados.length} visto(s) hoje</span>
      </div>
      <div ref={divRef} className="mapa-alunos" />
      <p className="note">Verde: com o Orbe aberto agora (posição a cada poucos segundos). Cinza: esteve no app hoje e parou — fica a última posição.
        O círculo verde claro é a incerteza do GPS do celular. {ref?.lat != null ? 'O tracejado dourado é o raio da presença de hoje.' : ''}</p>
      {!online && <p className="note" style={{ color: 'var(--miss)' }}>Offline — o mapa atualiza quando a conexão voltar.</p>}
    </div>
  )
}
