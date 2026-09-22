import React from 'react'
import { arteAvatar, existe } from './lib/avatares'

/* A cara de uma pessoa no Orbe, num lugar só.

   Duas caras, e a regra dela (18/09/2026) diz qual vale onde:

   - SELFIE (`foto`): só nas telas da PROFESSORA — chamada, radar, insígnias, missões,
     equipes, análise. É como ela reconhece o aluno. Passe `a`, a linha do aluno.
   - AVATAR escolhido (`avatar`, a chave do catálogo): no app do ALUNO e em qualquer lugar
     onde outro aluno enxergue — o cabeçalho dele, a coleção, a equipe, o pódio.

   Sem foto e sem avatar, valem as iniciais — nunca um buraco na lista. Quem passar os dois
   está numa tela da professora: a selfie ganha. */

export const iniciais = n => {
  const p = String(n || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/* tam: 'mini' (26 px, listas e tabelas densas) · '' (44 px, padrão) · 'big' (confirmação da chamada) */
export default function Avatar({ a, nome, foto, avatar, tam = '' }) {
  const n = a ? a.nome : nome
  const f = a ? a.foto : foto
  const av = a ? a.avatar : avatar
  const cls = tam === 'big' ? 'confirm-photo' : 'avatar' + (tam ? ' ' + tam : '')
  return (
    <span className={cls}>
      {f ? <img src={f} alt="" />
        : existe(av) ? <img src={arteAvatar(av, { tam: tam === 'mini' ? 128 : 256 })} alt="" />
        : iniciais(n)}
    </span>
  )
}
