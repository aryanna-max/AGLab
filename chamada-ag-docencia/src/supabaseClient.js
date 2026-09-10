import { createClient } from '@supabase/supabase-js'

// Valores públicos do projeto (a chave "anon/publishable" é feita para uso no cliente;
// a proteção real dos dados é o RLS no banco). Podem vir também de variáveis de ambiente.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://xxwvdcdpcndgmntdkazs.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_XlvPcFK6q9LQ6IuR-YOG0Q_a1Tsr9yt'

export const supabase = createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true }
})
