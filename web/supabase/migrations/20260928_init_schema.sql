-- CONSIGNADO 360 / A&K & DeskComm
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.profiles (id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,nome VARCHAR(255) NOT NULL,email VARCHAR(255) UNIQUE NOT NULL,role VARCHAR(20) NOT NULL DEFAULT 'OPERADOR' CHECK (role IN ('DONO','GESTOR','OPERADOR')),created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS public.leads (id UUID DEFAULT gen_random_uuid() PRIMARY KEY,operador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,nome VARCHAR(255) NOT NULL,cpf VARCHAR(14),telefone VARCHAR(20),margem_disponivel NUMERIC(10,2) DEFAULT 0.00,beneficio_inss VARCHAR(50),status VARCHAR(50) NOT NULL DEFAULT 'DISPONIVEL',tentativas_contato INT NOT NULL DEFAULT 0,agendamento_retorno TIMESTAMPTZ,observacoes TEXT,created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS operador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS telefone VARCHAR(20);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS margem_disponivel NUMERIC(10,2) DEFAULT 0.00;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS beneficio_inss VARCHAR(50);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tentativas_contato INT NOT NULL DEFAULT 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS agendamento_retorno TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS observacoes TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.historico_chamadas (id UUID DEFAULT gen_random_uuid() PRIMARY KEY,lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,operador_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,tipo_telefonia VARCHAR(20) DEFAULT 'PHONE_LINK',audio_url TEXT,transcricao_texto TEXT,resumo_ia TEXT,sentimento VARCHAR(20),nota_qualidade INT CHECK (nota_qualidade BETWEEN 0 AND 100),objecao_detectada TEXT,created_at TIMESTAMPTZ DEFAULT NOW());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER AS $$ BEGIN INSERT INTO public.profiles(id,email,nome,role) VALUES(NEW.id,COALESCE(NEW.email,''),COALESCE(NEW.raw_user_meta_data->>'nome','Usuário Consignado 360'),'OPERADOR') ON CONFLICT(id) DO NOTHING; RETURN NEW; END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.current_role() RETURNS TEXT AS $$ SELECT role FROM public.profiles WHERE id=auth.uid(); $$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,private;
REVOKE ALL ON FUNCTION private.current_role() FROM PUBLIC; GRANT EXECUTE ON FUNCTION private.current_role() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY; ALTER TABLE public.historico_chamadas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_self" ON public.profiles; DROP POLICY IF EXISTS "profiles_management" ON public.profiles;
CREATE POLICY "profiles_self" ON public.profiles FOR SELECT TO authenticated USING(id=auth.uid());
CREATE POLICY "profiles_management" ON public.profiles FOR ALL TO authenticated USING((SELECT private.current_role()) IN('DONO','GESTOR')) WITH CHECK((SELECT private.current_role()) IN('DONO','GESTOR'));
DROP POLICY IF EXISTS "leads_management" ON public.leads; DROP POLICY IF EXISTS "leads_operator_select" ON public.leads; DROP POLICY IF EXISTS "leads_operator_update" ON public.leads; DROP POLICY IF EXISTS "leads_operator_insert" ON public.leads;
CREATE POLICY "leads_management" ON public.leads FOR ALL TO authenticated USING((SELECT private.current_role()) IN('DONO','GESTOR')) WITH CHECK((SELECT private.current_role()) IN('DONO','GESTOR'));
CREATE POLICY "leads_operator_select" ON public.leads FOR SELECT TO authenticated USING(operador_id=auth.uid() OR operador_id IS NULL);
CREATE POLICY "leads_operator_update" ON public.leads FOR UPDATE TO authenticated USING(operador_id=auth.uid() OR operador_id IS NULL) WITH CHECK(operador_id=auth.uid() OR operador_id IS NULL);
DROP POLICY IF EXISTS "history_management" ON public.historico_chamadas; DROP POLICY IF EXISTS "history_operator_insert" ON public.historico_chamadas; DROP POLICY IF EXISTS "history_operator_select" ON public.historico_chamadas;
CREATE POLICY "history_management" ON public.historico_chamadas FOR ALL TO authenticated USING((SELECT private.current_role()) IN('DONO','GESTOR')) WITH CHECK((SELECT private.current_role()) IN('DONO','GESTOR'));
CREATE POLICY "history_operator_insert" ON public.historico_chamadas FOR INSERT TO authenticated WITH CHECK(operador_id=auth.uid());
CREATE POLICY "history_operator_select" ON public.historico_chamadas FOR SELECT TO authenticated USING(operador_id=auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.leads TO authenticated; GRANT SELECT,INSERT ON public.historico_chamadas TO authenticated; GRANT SELECT ON public.profiles TO authenticated;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.leads; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_leads_operador_status ON public.leads(operador_id,status,created_at); CREATE INDEX IF NOT EXISTS idx_leads_status_created ON public.leads(status,created_at); CREATE INDEX IF NOT EXISTS idx_history_lead_created ON public.historico_chamadas(lead_id,created_at DESC);
