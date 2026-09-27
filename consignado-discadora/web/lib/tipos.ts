export type Disposicao =
  | "atendeu"
  | "nao_atendeu"
  | "ocupado"
  | "secretaria"
  | "whatsapp"
  | "ligacao_caiu"
  | "numero_invalido"
  | "falha_agent";

export const DISPOSICOES: { valor: Disposicao; rotulo: string; cor: string }[] = [
  { valor: "atendeu", rotulo: "Atendeu", cor: "#16a34a" },
  { valor: "nao_atendeu", rotulo: "Não atendeu", cor: "#64748b" },
  { valor: "ocupado", rotulo: "Ocupado", cor: "#64748b" },
  { valor: "secretaria", rotulo: "Secretária eletrônica", cor: "#9333ea" },
  { valor: "whatsapp", rotulo: "Pediu WhatsApp", cor: "#0ea5e9" },
  { valor: "ligacao_caiu", rotulo: "Caiu", cor: "#64748b" },
  { valor: "numero_invalido", rotulo: "Número inválido", cor: "#b45309" },
];

export type LeadFila = {
  job_id: string;
  lead_id: number;
  nome: string | null;
  telefone: string;
  cpf_mask: string | null;
  cidade: string | null;
  uf: string | null;
  campanha: string | null;
  publico: string | null;
  script_resumo: string | null;
  margem_estimada: number | null;
  tentativas: number;
  obs: string | null;
  origem_fila: string | null;
  banco_folha: string | null;
  pendente_carteira: number;
  roteiro_id: string | null;
  roteiro: RoteiroNoClaim | null;
  campanha_id: string | null;
  formulario: CampoFormulario[];
  extras: Record<string, unknown>;
};

/* ---------- roteiro de ligação (biblioteca no banco, não em localStorage) ---------- */

export type PassoRoteiro = {
  id: number;
  ordem: number;
  titulo: string;
  texto: string;
  obrigatorio: boolean;
  feito?: boolean;
};

export type ObjecaoRoteiro = { objecao: string; resposta: string; proibido: string | null };

/** linha de `v_roteiros` — o editor de roteiros lê tudo isto em um request */
export type Roteiro = {
  id: string;
  nome: string;
  publico: string;
  versao: number;
  ativo: boolean;
  aviso_compliance: string | null;
  em_uso: number;
  atualizado_em: string;
  passos: PassoRoteiro[];
  objecoes: ObjecaoRoteiro[];
};

/** o objeto que `fn_claim_next_lead` devolve em `roteiro` (com `feito` por lead) */
export type RoteiroNoClaim = {
  nome: string;
  versao: number;
  publico: string;
  aviso: string | null;
  passos: PassoRoteiro[];
  objecoes: ObjecaoRoteiro[];
};

/** linha de `v_aderencia_roteiro` */
export type LinhaAderencia = {
  agente_id: string;
  agente: string;
  papel: Papel;
  leads_de_hoje: number;
  passos_devidos: number;
  passos_cumpridos: number;
  aderencia_pct: number | null;
};

export type PainelDia = {
  dia: string;
  campanha: string | null;
  agente: string | null;
  chamadas: number;
  contatos: number;
  taxa_contato_pct: number | null;
  efetivos_30s: number;
  segundos_falados: number | null;
};

export type AnuenciaPendente = {
  proposta_id: string;
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  valor: number;
  parcelas: number;
  anuencia: string;
  enviada_em: string;
  prazo_validade: string;
  dias_restantes: number;
  responsavel?: string | null;
};

// --------------------------------------------------------------------- equipe/RBAC
export type Papel = "operador" | "supervisor" | "admin";
export type AnuenciaStatus = "enviada" | "pendente_confirmacao" | "confirmada" | "expirada" | "recusada";

export const PAPEIS: { valor: Papel; rotulo: string; descricao: string }[] = [
  { valor: "operador", rotulo: "Operador", descricao: "disca a própria carteira e o pool das campanhas dele" },
  { valor: "supervisor", rotulo: "Supervisor", descricao: "vê o time, monta carteira e edita as próprias campanhas" },
  { valor: "admin", rotulo: "Admin", descricao: "tudo: equipe, papéis, campanhas, janelas fora do padrão" },
];

export type AcessoCampanha = { id: string; nome: string; papel?: Papel; limite_diario?: number | null };

export type QuemSou = {
  agente_id: string | null;
  email: string | null;
  nome: string | null;
  papel: Papel | "ninguem";
  ativo: boolean;
  celular: string | null;
  limite_diario: number;
  pausado_ate: string | null;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  discadas_hoje: number;
  campanhas: AcessoCampanha[];
  gerencia: { id: string; nome: string }[];
  /** cadastro da empresa (o dono edita em /empresa) — aparece no topo das telas */
  empresa: {
    nome: string;
    cnpj: string | null;
    responsavel_lgpd: string | null;
    aviso_gravacao: string | null;
  } | null;
  tarefas_abertas: number;
};

export type MembroEquipe = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  celular: string | null;
  limite_diario: number;
  pausado_ate: string | null;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  auth_id: string | null;
};

export type LinhaRanking = {
  agente_id: string;
  nome: string;
  papel: Papel;
  status_agente: string | null;
  ultimo_ciclo_em: string | null;
  limite_diario: number;
  chamadas: number;
  contatos: number;
  efetivos_30s: number;
  segundos_falados: number;
  na_carteira: number;
  taxa_contato_pct: number | null;
};

export type LinhaMonitor = {
  id: string;
  nome: string;
  papel: Papel;
  ativo: boolean;
  status_agente: string | null;
  pausado_ate: string | null;
  ultimo_ciclo_em: string | null;
  agente_online: boolean;
  limite_diario: number;
  discadas_hoje: number;
  jobs_abertos: number;
  carteira_pendente: number;
  campanhas: string[] | null;
};

export type CampanhaGestao = {
  id: string;
  nome: string;
  publico: string;
  ativo: boolean;
  janela_ini: string;
  janela_fim: string;
  max_tentativas: number;
  intervalo_retentativa_s: number;
  permite_overflow: boolean;
  script_resumo: string | null;
  na_fila: number;
  atribuidos: number;
  equipe: { agente_id: string; nome: string; email: string; papel: Papel; limite_diario: number | null }[];
};

/* ---------- contratos entre as actions e as telas ---------- */

/** `fn_claim_next_lead` (JSONB) — o que a tela do operador mostra para discar. */
export type ProximoLead = {
  lead_id: number;
  job_id: string;
  telefone_e164: string;
  telefone_usado: string;
  nome: string | null;
  banco_folha: string | null;
  uf: string | null;
  margem_estimada: number | null;
  tentativas: number;
  max_tentativas: number;
  script_resumo: string | null;
  campanha_id: string;
  campanha_nome: string | null;
  janela_ini: string;
  janela_fim: string;
  origem_fila: "rigida" | "overflow";
  duplicado_de: number | null;
};

/** `v_fila` — o que dá para consultar sem travar ninguém (o claim é outra coisa). */
export type FilaItem = {
  lead_id: number;
  nome: string | null;
  telefone_e164: string;
  status: string;
  tentativas: number;
  prioridade: number;
  banco_folha: string | null;
  tem_matricula: boolean;
  campanha: string | null;
  max_tentativas: number;
  proximo_contato_at: string | null;
  dono: string | null;
  na_minha_carteira: boolean;
};

/** `v_campanhas_aberta` (via view pública `v_campanhas_aberta` criada no schema). */
export type CampanhaAberta = {
  id: string;
  nome: string;
  publico: string;
  janela_ini: string;
  janela_fim: string;
  max_tentativas: number;
  intervalo_retentativa_s: number;
  script_resumo: string | null;
  permite_overflow: boolean;
};

export type ImportarResult = {
  aceitos: number;
  ignorados: {
    total: number;
    cpf_invalido: number;
    opt_out: number;
    telefone_fora_do_padrao: number;
    duplicado_na_planilha: number;
    duplicado_no_banco: number;
    janela_invalida: number;
  };
  avisos: { linha: number; campo: string; motivo: string }[];
};

export type PausarResult = {
  pausado_ate: string | null; // timestamptz — a tela calcula a volta a partir daqui
  proximo_despertar: string | null;
  motivo: string | null;
};

export type Convite = {
  email: string;
  ja_existe: boolean;
  url: string | null;
  aviso?: string;
};

export type PerfilInput = {
  nome?: string;
  telefone?: string;
  dispositivo?: string;
};

export type PropostaInput = {
  leadId: number | string;
  valor: string | number;
  parcelas: string | number;
  taxaAa?: string | number;
  banco?: string;
  protocoloInss?: string;
  obs?: string;
};

/** linha de `fn_agendar_retorno` / devolução de lead por expiração. */
export type Retorno = { lead_id: number; agendado_para: string; status: string };

/* ---------- porte dos concorrentes: cadência, tabulação, CRM, QA, empresa ---------- */

/** linha de `fn_politica_rediscagem` / body de `fn_salvar_politica_rediscagem`. */
export type PoliticaLinha = {
  disposition: Disposicao;
  acao: "repetir" | "contato" | "qualificar" | "descartar" | "sem_contato";
  intervalo_s: number;
  hora_alvo: string | null;
  max_tentativas: number | null;
  prioridade_delta: number;
  observacao: string | null;
};

/** campo do formulário de tabulação da campanha (`campanhas.formulario`). */
export type CampoFormulario = {
  chave: string;
  rotulo: string;
  tipo: "texto" | "numero" | "data" | "selecao" | "sim_nao" | "telefone";
  opcoes?: string[];
  obrigatorio?: boolean;
};

export type Tarefa = {
  id: number;
  lead_id: number;
  lead: string | null;
  telefone_e164?: string;
  campanha: string | null;
  titulo: string;
  tipo: string;
  detalhe: string | null;
  vence_em: string;
  concluida_em: string | null;
  resultado: string | null;
  agente_id: string | null;
  dono: string | null;
  situacao: "vencida" | "hoje" | "futura" | "concluida";
};

export type MetaDia = {
  campanha_id: string;
  campanha: string;
  meta_diaria: number | null;
  contatos_hoje: number;
  chamadas_hoje: number;
  pct_meta: number | null;
  faltam: number;
  operadores_ativos: number;
};

export type QaLinha = {
  agente_id: string;
  agente: string;
  papel: string;
  avaliacoes: number;
  nota_media: number | null;
  pior_nota: number | null;
  ultima_avaliacao: string | null;
  auditorias_da_semana: number;
};

export type FunilLinha = {
  campanha: string | null;
  status: string;
  leads: number;
  total_campanha: number | null;
  pct_da_campanha: number | null;
};

export type MapaLinha = { dow: number; hora: number; chamadas: number; contatos: number; taxa_contato_pct: number | null; duracao_media_s: number | null };

/** `v_visao_dono` — a operação inteira num request. */
export type VisaoDono = {
  operadores_ativos: number;
  operadores_online: number;
  campanhas_ativas: number;
  leads_na_fila: number;
  aguardando_proposta: number;
  propostas_totais: number;
  anuencia_aberta: number;
  anuencia_confirmada: number;
  valor_confirmado: number;
  valor_em_andamento: number;
  chamadas_hoje: number;
  contatos_hoje: number;
  efetivos_hoje: number;
  taxa_contato_pct: number | null;
  proposta_por_contato_pct: number | null;
  numeros_bloqueados: number;
  tarefas_vencidas: number;
  qa_semana: number;
};

export type Pendencias = {
  tarefas_vencidas: number;
  retornos_de_hoje: number;
  anuencia_hoje: number;
  qualificados_sem_proposta: number;
  qa_da_semana: number;
  fila_parada: number;
};

export type EmpresaInfo = {
  id?: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  responsavel_lgpd: string | null;
  aviso_gravacao: string | null;
  janela_ini?: string;
  janela_fim?: string;
};

/** `fn_ficha_lead` — o 360º montado no banco, num request só. */
export type FichaLead = {
  ok: boolean;
  erro?: string;
  lead?: Record<string, unknown>;
  campanha?: { id: string; nome: string; publico: string; formulario: CampoFormulario[]; roteiro_id: string | null; meta_diaria: number | null } | null;
  eventos?: { quando: string; de: string | null; para: string | null; detalhe: string | null }[];
  cdrs?: { id: number; quando: string; duracao_s: number | null; disposition: string; nota: string | null; fonte: string; agente: string | null }[];
  propostas?: { id: string; valor: number; parcelas: number; taxa_aa: number | null; anuencia: string; enviada_em: string; prazo_validade: string; protocolo: string | null; banco: string | null }[];
  tarefas?: Tarefa[];
  roteiro?: { titulo: string; obrigatorio: boolean; feito: boolean | null; marcado_em: string | null }[];
  qa?: { nota: number; criterios: Record<string, unknown>; achados: string | null; plano_acao: string | null; quando: string; avaliador: string | null }[];
  bloqueio?: { motivo: string; detalhe: string | null; expira_em: string | null; origem: string } | null;
};

export type Simulacao = {
  parcela_maxima: number;
  valor_maximo: number;
  total_pago: number;
  juros_totais: number;
  parcelas: number;
  taxa_aa: number;
  limite_margem_pct: number;
  dentro_das_regras: boolean;
  regras: string[];
};

/** item de `public.bloqueios` na tela do dono. */
export type BloqueioLinha = {
  telefone_e164: string;
  motivo: string;
  detalhe: string | null;
  expira_em: string | null;
  origem: string;
  criado_em: string;
  criado_por: string | null;
  dias_restantes: number | null;
  leads: number;
  leads_vivos: number;
};
