import * as XLSX from "xlsx";
import Papa from "papaparse";

export const digits = (v:any) => String(v ?? "").replace(/[^0-9]/g, "");
export const phone = (v:any) => {
  let d = digits(v);
  if (!d) return "";
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
};
export const cpf = (v:any) => digits(v);

const norm = (v:any) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const aliases:any = {
  nome:["nome","cliente","beneficiario","beneficiário","name"],
  cpf:["cpf","documento"],
  telefone:["telefone","celular","fone","fone1","telefone1","phone"],
  telefone2:["telefone2","celular2","fone2"],
  cidade:["cidade","municipio","município"],
  uf:["uf","estado"],
  banco:["banco","banco atual","banco_atual","banco do beneficio","banco do benefício","instituicao","instituição","instituicao financeira","instituição financeira","bank"],
  produto:["produto","modalidade"],
  observacao:["observacao","observação","obs"]
};

function parseCsv(text:string) {
  const clean = text.replace(/^\uFEFF/, "");
  const first = clean.split(/\r?\n/, 1)[0] || "";
  const delimiter = first.includes(";") ? ";" : first.includes("\t") ? "\t" : ",";
  const r = Papa.parse(clean, {header:true, skipEmptyLines:true, delimiter});
  return (r.data || []) as any[];
}

function serializeExtraValue(value:any) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

export async function parseFile(file:File){
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  let rows:any[] = [];
  if(ext === "csv" || ext === "txt") rows = parseCsv(await file.text());
  else {
    const wb = XLSX.read(await file.arrayBuffer(), {type:"array", cellDates:true});
    const first = wb.SheetNames[0];
    if(!first) throw new Error("A planilha não possui abas.");
    rows = XLSX.utils.sheet_to_json(wb.Sheets[first], {defval:""});
  }

  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const find = (names:string[]) => cols.find(x => names.includes(norm(x)));
  const map:any = {};
  Object.keys(aliases).forEach(k => map[k] = find(aliases[k]));

  const parsed = rows.map(r => {
    // Preserva TODAS as colunas originais da planilha. Campos conhecidos continuam
    // normalizados para o fluxo operacional, enquanto nenhum campo desconhecido é perdido.
    const extras:any = Object.fromEntries(
      Object.entries(r).map(([key,value]) => [key, serializeExtraValue(value)])
    );
    const banco = map.banco ? String(r[map.banco] ?? "").trim() : "";
    const produtoBase = map.produto ? String(r[map.produto] ?? "").trim() : "";
    const produto = [produtoBase, banco ? "Banco: " + banco : ""].filter(Boolean).join(" • ");

    // Metadados do importador ficam em chaves próprias sem apagar os valores originais.
    extras._importacao = {
      banco,
      produto_original: produtoBase,
      colunas: cols.length,
      origem: file.name
    };

    return {
      nome: map.nome ? String(r[map.nome] ?? "").trim() : "",
      cpf: cpf(map.cpf ? r[map.cpf] : ""),
      telefone: phone(map.telefone ? r[map.telefone] : ""),
      telefone2: phone(map.telefone2 ? r[map.telefone2] : ""),
      cidade: map.cidade ? String(r[map.cidade] ?? "").trim() : "",
      uf: map.uf ? String(r[map.uf] ?? "").trim().toUpperCase() : "",
      banco,
      produto,
      observacao: map.observacao ? String(r[map.observacao] ?? "").trim() : "",
      extras
    };
  });

  return {ext, cols, map, rows:parsed, total:parsed.length, validos:parsed.filter(x => x.nome && (x.telefone || x.telefone2)).length};
}
