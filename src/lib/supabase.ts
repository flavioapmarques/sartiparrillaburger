import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && key)

// Somente a chave pública (anon). A segurança real fica nas políticas RLS do banco.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing')
