import React from 'react'

/* A cara de uma pessoa no Orbe, num lugar só.

   A selfie que o aluno manda na Presença (MinhaFoto → alunos.foto_data) é o avatar dele
   em TODO o resto do app: chamada, radar, insígnias, missões, equipes e análise. Antes
   só a lista da chamada e o radar mostravam a foto; nas outras telas o aluno era uma
   linha de texto, e a professora tinha que ler nome por nome.

   Sem foto, valem as iniciais — nunca um buraco na lista. A foto que a professora sobe
   pelo Storage entra pelo mesmo campo `a.foto` e vale igual. */

export const iniciais = n => {
  const p = String(n || '').trim().split(/\s+/)
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/* tam: 'mini' (26 px, listas e tabelas densas) · '' (44 px, padrão) · 'big' (confirmação da chamada).
   Aceita o aluno inteiro (a) ou nome/foto soltos — o aluno não tem "linha de aluno" na mão. */
export default function Avatar({ a, nome, foto, tam = '' }) {
  const n = a ? a.nome : nome
  const f = a ? a.foto : foto
  const cls = tam === 'big' ? 'confirm-photo' : 'avatar' + (tam ? ' ' + tam : '')
  return <span className={cls}>{f ? <img src={f} alt="" /> : iniciais(n)}</span>
}
