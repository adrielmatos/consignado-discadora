/**
 * Importador de planilha tolerante.
 *
 * Ideia portada (a ideia, não o código) do importador "universal" do repositório
 * `adrielmatos/ak-call-center`: planilha de consignado quase nunca chega com o
 * cabeçalho que o sistema quer — vem `BANCO DO BENEFÍCIO`, `Instituição`,
 * `Margem Consignável`, `Tel.` — e descartar as colunas não mapeadas é jogar
 * fora dado de negócio (matrícula, banco, data de concessão).
 *
 * Regras deste módulo:
 *  1. separador (`,` `;` TAB `|`) detectado sozinho, aspas e quebra de linha
 *     dentro da célula suportadas, BOM removido;
 *  2. cabeçalho reconhecido por apelidos normalizados (sem acento, sem pontuação);
 *  3. sem cabeçalho reconhecível, cai no contrato posicional antigo:
 *     `numero,nome,cpf,cidade,uf,margem,obs`;
 *  4. toda coluna não reconhecida é preservada em `extras` (jsonb no banco);
 *  5. telefone é normalizado para E164 e CPF é validado por dígito verificador
 *     antes de entrar — linha sem telefone válido não entra na fila.
 *
 * Módulo puro: sem Next e sem Supabase, para poder ser testado com `node --test`.
 */

export const COLUNAS_CONHECIDAS = [
  "telefone",
  "nome",
  "cpf",
  "cidade",
  "uf",
  "banco",
  "margem",
  "renda",
  "obs",
  "referencia",
] as const;

export type ColunaConhecida = (typeof COLUNAS_CONHECIDAS)[number];

/** Cabeçalhos aceitos por coluna do banco, já na forma normalizada. */
export const APELIDOS: Record<ColunaConhecida, readonly string[]> = {
  telefone: ["numero", "telefone", "telefone_celular", "celular", "whatsapp", "fone", "phone", "numero_celular", "numero_whatsapp", "telefone1", "contato"],
  nome: ["nome", "nome_completo", "cliente", "beneficiario", "segurado", "nome_razao_social", "razao_social"],
  cpf: ["cpf", "cpf_cnpj", "documento", "cpf_cliente", "cpf_cpf", "cpf_beneficiario"],
  cidade: ["cidade", "municipio", "localidade", "cidade_uf"],
  uf: ["uf", "estado", "sigla_uf", "uf_estado"],
  banco: ["banco", "banco_folha", "banco_pagador", "banco_do_beneficio", "banco_beneficio", "instituicao", "instituicao_financeira", "instituidora", "consignante", "orgao_pagador"],
  margem: ["margem", "margem_consignavel", "margem_estimada", "margem_disponivel", "margem_livre", "valor_margem", "margem_consignada_disponivel"],
  renda: ["renda", "renda_estimada", "renda_bruta", "renda_mensal", "beneficio", "valor_beneficio", "salario", "salario_bruto"],
  obs: ["obs", "observacao", "observacoes", "nota", "anotacao", "mensagem"],
  referencia: ["ref", "ref_externa", "referencia", "referencia_externa", "matricula", "id_cliente", "id_lead", "protocolo", "protocolo_inss"],
};

/** Contrato posicional usado quando a planilha não tem linha de cabeçalho. */
export const ORDEM_SEM_CABECALHO: readonly ColunaConhecida[] = [
  "telefone",
  "nome",
  "cpf",
  "cidade",
  "uf",
  "margem",
  "obs",
];

/** `Nº`, `D.O.` → `n`, `d_o`. Usado para casar cabeçalho com apelido. */
export function normalizarCabecalho(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function contarCampos(linha: string, delim: string): number {
  let n = 1;
  let dentro = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') dentro = !dentro;
    else if (ch === delim && !dentro) n++;
  }
  return n;
}

/** Escolhe o separador pelo que produz mais colunas na primeira linha. */
export function detectarDelimitador(primeiraLinha: string): string {
  let melhor = ",";
  let melhorN = 1;
  for (const candidato of [",", ";", "\t", "|"]) {
    const n = contarCampos(primeiraLinha, candidato);
    if (n > melhorN) {
      melhorN = n;
      melhor = candidato;
    }
  }
  return melhor;
}

/** RFC 4180 básico: aspas duplas, `""` como aspa literal, `\n` dentro da célula. */
export function dividirCampos(texto: string, delim: string): string[][] {
  const linhas: string[][] = [];
  let atual: string[] = [];
  let campo = "";
  let dentro = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i] as string;
    if (dentro) {
      if (ch === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentro = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }
    if (ch === '"') dentro = true;
    else if (ch === delim) {
      atual.push(campo);
      campo = "";
    } else if (ch === "\n") {
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
    } else if (ch !== "\r") campo += ch;
  }
  if (campo !== "" || atual.length > 0) {
    atual.push(campo);
    linhas.push(atual);
  }

  return linhas
    .map((l) => l.map((c) => c.trim()))
    .filter((l) => l.some((c) => c !== ""));
}

export interface LeituraPlanilha {
  temCabecalho: boolean;
  cabecalhos: string[];
  linhas: string[][];
}

export function lerPlanilha(texto: string): LeituraPlanilha {
  const bruto = texto.replace(/^\uFEFF/, "");
  const primeira = bruto.split(/\r?\n/)[0] ?? "";
  const todas = dividirCampos(bruto, detectarDelimitador(primeira));
  if (todas.length === 0) return { temCabecalho: false, cabecalhos: [], linhas: [] };

  const candidatos = (todas[0] ?? []).map((c) => normalizarCabecalho(c));
  const reconhecidos = candidatos.filter((c) => procurarColuna(c) !== null).length;
  // Cabeçalho só é cabeçalho se pelo menos uma coluna conhecida for reconhecida
  // e se nenhuma linha candidata parecer um telefone (primeira célula só dígitos).
  const pareceNumero = /^\+?\d{8,}$/.test(candidatos[0] ?? "");
  if (reconhecidos > 0 && !pareceNumero) {
    return { temCabecalho: true, cabecalhos: candidatos, linhas: todas.slice(1) };
  }
  return { temCabecalho: false, cabecalhos: [], linhas: todas };
}

/**
 * Fallback por token: cabeçalho de planilha de banco raramente é o nome exato
 * ("Nome do Beneficiário", "Banco do Benefício", "Margem Consignável (R$)").
 * Casamos por token separável para não cair no substring perigoso ("uf" dentro
 * de "suficiente"). A ordem de COLUNAS_CONHECIDAS desempata: "cpf" ganha de
 * "banco" em "CPF do titular do banco".
 */
const TOKENS: Record<ColunaConhecida, readonly string[]> = {
  telefone: ["telefone", "celular", "whatsapp", "fone", "phone", "numero", "n", "contato", "dddddd"],
  nome: ["nome", "cliente", "beneficiario", "segurado", "razao", "titular"],
  cpf: ["cpf", "cnpj", "documento"],
  cidade: ["cidade", "municipio", "localidade"],
  uf: ["uf", "estado", "sigla"],
  banco: ["banco", "instituicao", "instituidora", "consignante", "pagador", "orgao"],
  margem: ["margem"],
  renda: ["renda", "salario", "beneficio", "provento"],
  obs: ["obs", "observacao", "observacoes", "nota", "anotacao"],
  referencia: ["ref", "referencia", "matricula", "protocolo", "convenio"],
};

export function procurarColuna(cabecalhoNormalizado: string): ColunaConhecida | null {
  if (!cabecalhoNormalizado) return null;
  for (const coluna of COLUNAS_CONHECIDAS) {
    if (APELIDOS[coluna].includes(cabecalhoNormalizado)) return coluna;
  }
  const tokens = cabecalhoNormalizado.split("_");
  for (const coluna of COLUNAS_CONHECIDAS) {
    if (tokens.some((tk) => TOKENS[coluna].includes(tk))) return coluna;
  }
  return null;
}

export interface Mapeamento {
  /** posição no array da linha para cada coluna conhecida (-1 = ausente) */
  indice: Record<ColunaConhecida, number>;
  /** colunas originais que não casaram com nada, preservadas como extras */
  extras: { indice: number; nome: string }[];
}

export function mapearCabecalhos(
  temCabecalho: boolean,
  cabecalhos: string[],
  largura: number,
): Mapeamento {
  const indice = Object.fromEntries(COLUNAS_CONHECIDAS.map((c) => [c, -1])) as Record<
    ColunaConhecida,
    number
  >;
  const extras: { indice: number; nome: string }[] = [];

  if (!temCabecalho) {
    ORDEM_SEM_CABECALHO.forEach((coluna, i) => {
      indice[coluna] = i;
    });
    for (let i = ORDEM_SEM_CABECALHO.length; i < largura; i++) {
      extras.push({ indice: i, nome: `coluna_${i + 1}` });
    }
    return { indice, extras };
  }

  cabecalhos.forEach((cabecalho, i) => {
    const coluna = procurarColuna(cabecalho);
    if (coluna && indice[coluna] === -1) {
      indice[coluna] = i;
      return;
    }
    if (coluna) {
      // Segunda coluna com o mesmo papel não substitui a primeira: vira extra.
      extras.push({ indice: i, nome: cabecalho || `coluna_${i + 1}` });
      return;
    }
    extras.push({ indice: i, nome: cabecalho || `coluna_${i + 1}` });
  });

  return { indice, extras };
}

/** `(79) 99999-0001`, `00 55 79 999990001`, `79999990001` → `+5579999990001` */
export function normalizarTelefone(bruto: string): string {
  let digitos = (bruto ?? "").replace(/\D/g, "");
  while (digitos.startsWith("00")) digitos = digitos.slice(2);
  if (digitos.startsWith("0") && digitos.length > 11) digitos = digitos.replace(/^0+/, "");
  if (digitos.startsWith("55") && digitos.length > 11) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

/** Dígito verificador de CPF, incluindo o caso "todos os dígitos iguais". */
export function cpfValido(bruto: string): boolean {
  const cpf = (bruto ?? "").replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const digitos = cpf.split("").map(Number);
  for (const pos of [9, 10]) {
    const multiplicador = pos + 1;
    let soma = 0;
    for (let i = 0; i < pos; i++) soma += (digitos[i] ?? 0) * (multiplicador - i);
    const resto = (soma * 10) % 11;
    if ((resto === 10 ? 0 : resto) !== digitos[pos]) return false;
  }
  return true;
}

/** `R$ 1.234,56` → 1234.56 · `350,00` → 350 · `1.234` → 1234 · `1234.56` → 1234.56 */
export function moeda(bruto: string): number | null {
  const s = (bruto ?? "").replace(/[^\d.,-]/g, "");
  if (!s || s === "-") return null;
  let t = s;
  if (t.includes(",")) {
    t = t.replace(/\./g, "").replace(/,/g, ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, "");
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export interface RegistroImportado {
  campanha_id: string;
  telefone_e164: string;
  nome: string | null;
  cpf: string | null;
  cidade: string | null;
  uf: string | null;
  banco_folha: string | null;
  margem_estimada: number | null;
  renda_estimada: number | null;
  obs: string | null;
  ref_externa: string | null;
  extras: Record<string, string>;
  consentimento: string;
  consentimento_em: string;
}

export interface LinhaIgnorada {
  linha: number;
  motivo: string;
}

export interface ResultadoImportacao {
  registros: RegistroImportado[];
  ignorados: LinhaIgnorada[];
  avisos: string[];
  colunasReconhecidas: string[];
  colunasPreservadas: number;
  totalLinhas: number;
}

function texto(n: string | undefined, max = 240): string | null {
  const v = (n ?? "").trim();
  if (!v) return null;
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

function serie(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === "object") {
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  }
  return String(valor);
}

export function montarLeads(
  csv: string,
  opcoes: { campanhaId: string; consentimento: string; consentimentoEm?: string },
): ResultadoImportacao {
  const leitura = lerPlanilha(csv);
  const avisos: string[] = [];
  const ignorados: LinhaIgnorada[] = [];

  if (leitura.linhas.length === 0) {
    return {
      registros: [],
      ignorados,
      avisos,
      colunasReconhecidas: [],
      colunasPreservadas: 0,
      totalLinhas: 0,
    };
  }

  const largura = Math.max(...leitura.linhas.map((l) => l.length), leitura.cabecalhos.length);
  const mapa = mapearCabecalhos(leitura.temCabecalho, leitura.cabecalhos, largura);
  const colunasReconhecidas = COLUNAS_CONHECIDAS.filter((c) => mapa.indice[c] >= 0).map(String);
  const consentimentoEm = opcoes.consentimentoEm ?? new Date().toISOString();

  if (colunasReconhecidas.length === 0) {
    avisos.push("nenhum cabeçalho reconhecido — usando ordem padrão numero,nome,cpf,cidade,uf,margem,obs");
  }
  if (mapa.indice.telefone === -1) {
    avisos.push("coluna de telefone não encontrada; linhas sem número válido serão ignoradas");
  }

  const vistos = new Map<string, number>();
  const registros: RegistroImportado[] = [];
  let cpfInvalidos = 0;
  let duplicados = 0;
  let sobrantas = 0;

  leitura.linhas.forEach((linha, i) => {
    const numeroLinha = i + (leitura.temCabecalho ? 2 : 1);
    const pegar = (coluna: ColunaConhecida): string | undefined => {
      const idx = mapa.indice[coluna];
      return idx >= 0 ? linha[idx] : undefined;
    };

    const telefone = normalizarTelefone(pegar("telefone") ?? "");
    if (!/^\+\d{10,15}$/.test(telefone)) {
      ignorados.push({ linha: numeroLinha, motivo: "telefone ausente ou inválido" });
      return;
    }

    const brutoCpf = texto(pegar("cpf"), 20) ?? "";
    const soDigitos = brutoCpf.replace(/\D/g, "");
    let cpf: string | null = null;
    if (soDigitos.length === 11) {
      if (cpfValido(soDigitos)) cpf = soDigitos;
      else cpfInvalidos++;
    } else if (soDigitos.length > 0) {
      cpfInvalidos++;
    }

    const ufBruto = (texto(pegar("uf"), 40) ?? "").toUpperCase();
    const ufMatch = ufBruto.match(/[A-Z]{2}/);
    const uf = ufMatch ? ufMatch[0] : null;

    const extras: Record<string, string> = {};
    for (const extra of mapa.extras) {
      const valor = texto(linha[extra.indice], 500);
      if (valor !== null && valor !== "") extras[extra.nome || `coluna_${extra.indice + 1}`] = valor;
    }

    // linha maior que o cabeçalho (planilha com vírgula solta dentro de número,
    // ex.: `812,44` em CSV separado por vírgula) não pode virar dado perdido.
    if (leitura.temCabecalho && linha.length > leitura.cabecalhos.length) {
      for (let j = leitura.cabecalhos.length; j < linha.length; j++) {
        const excedente = texto(linha[j], 500);
        if (excedente) extras[`sobrante_${j + 1}`] = excedente;
      }
      sobrantas++;
    }

    const chave = `${telefone}|${cpf ?? ""}`;
    const anterior = vistos.get(chave);
    if (anterior !== undefined) {
      duplicados++;
      ignorados.push({ linha: numeroLinha, motivo: `duplicata da linha ${anterior}` });
      return;
    }
    vistos.set(chave, numeroLinha);

    registros.push({
      campanha_id: opcoes.campanhaId,
      telefone_e164: telefone,
      nome: texto(pegar("nome"), 160),
      cpf,
      cidade: texto(pegar("cidade"), 120),
      uf,
      banco_folha: texto(pegar("banco"), 120),
      margem_estimada: moeda(serie(pegar("margem"))),
      renda_estimada: moeda(serie(pegar("renda"))),
      obs: texto(pegar("obs"), 2000),
      ref_externa: texto(pegar("referencia"), 120),
      extras,
      consentimento: opcoes.consentimento,
      consentimento_em: consentimentoEm,
    });
  });

  if (cpfInvalidos > 0) {
    avisos.push(`${cpfInvalidos} CPF(s) descartado(s) por não bater o dígito verificador`);
  }
  if (duplicados > 0) {
    avisos.push(`${duplicados} linha(s) repetida(s) no arquivo foram ignoradas`);
  }
  if (sobrantas > 0) {
    avisos.push(
      `${sobrantas} linha(s) tinham mais campos que o cabeçalho — o excedente foi guardado em ` +
        "extras como sobrante_N. Confira se a planilha usa vírgula decimal sem aspas (812,44); " +
        "nesse caso exporte com separador ; (ponto e vírgula)",
    );
  }

  return {
    registros,
    ignorados,
    avisos,
    colunasReconhecidas,
    colunasPreservadas: mapa.extras.length,
    totalLinhas: leitura.linhas.length,
  };
}
