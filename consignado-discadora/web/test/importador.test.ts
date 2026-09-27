import assert from "node:assert/strict";
import test from "node:test";

import {
  cpfValido,
  detectarDelimitador,
  dividirCampos,
  moeda,
  montarLeads,
  normalizarCabecalho,
  normalizarTelefone,
  lerPlanilha,
} from "../lib/importador";

const CAMPANHA = "11111111-1111-4111-8111-111111111111";
const opcoes = {
  campanhaId: CAMPANHA,
  consentimento: "form_proprio",
  consentimentoEm: "2026-09-27T12:00:00.000Z",
};

test("cabeçalho com acento e pontuação é normalizado", () => {
  assert.equal(normalizarCabecalho("  Nº do Telefone "), "n_do_telefone");
  assert.equal(normalizarCabecalho("Banco do Benefício"), "banco_do_beneficio");
  assert.equal(normalizarCabecalho("Margem Consignável (R$)"), "margem_consignavel_r");
});

test("separador é detectado por quem gera mais colunas", () => {
  assert.equal(detectarDelimitador("a;b;numero;nome"), ";");
  assert.equal(detectarDelimitador("a,b,numero,nome"), ",");
  assert.equal(detectarDelimitador("a\tnumero\tnome"), "\t");
  assert.equal(detectarDelimitador("so-uma-coluna"), ",");
});

test("dividirCampos trata aspas, aspa literal e quebra de linha dentro da célula", () => {
  const linhas = dividirCampos('a,"b,c","d""e"\n1,2,"x\ny"', ",");
  assert.deepEqual(linhas, [
    ["a", "b,c", 'd"e'],
    ["1", "2", "x\ny"],
  ]);
});

test("sem cabeçalho reconhecível cai no contrato posicional", () => {
  const r = montarLeads("79999990001,Maria,52998224725,Aracaju,SE,350,cliente antigo", opcoes);
  assert.equal(r.registros.length, 1);
  const l = r.registros[0]!;
  assert.equal(l.telefone_e164, "+5579999990001");
  assert.equal(l.nome, "Maria");
  assert.equal(l.cpf, "52998224725");
  assert.equal(l.uf, "SE");
  assert.equal(l.margem_estimada, 350);
  assert.equal(l.obs, "cliente antigo");
  assert.deepEqual(l.extras, {});
});

test("cabeçalho com apelidos reais de planilha de banco é mapeado", () => {
  const csv =
    "Nome do Beneficiário;Telefone;CPF;Município;UF;Banco do Benefício;Margem Consignável;Matrícula\n" +
    'Maria de teste;(79) 99999-0001;529.982.247-25;Aracaju;SE;Itaú;"R$ 350,00";1234567\n';
  const r = montarLeads(csv, opcoes);
  assert.equal(r.registros.length, 1);
  const l = r.registros[0]!;
  assert.equal(l.nome, "Maria de teste");
  assert.equal(l.telefone_e164, "+5579999990001");
  assert.equal(l.cpf, "52998224725");
  assert.equal(l.cidade, "Aracaju");
  assert.equal(l.banco_folha, "Itaú");
  assert.equal(l.margem_estimada, 350);
  assert.equal(l.ref_externa, "1234567");
  // nenhuma coluna é perdida: o que não é operacional fica em extras
  assert.deepEqual(l.extras, {});
  assert.equal(r.colunasReconhecidas.join(","), "telefone,nome,cpf,cidade,uf,banco,margem,referencia");
});

test("coluna desconhecida é preservada em extras, não descartada", () => {
  const csv =
    "telefone,nome,Data de Concessão,Vínculo,Valor da parcela\n" +
    "79999990001,Maria,2024-03-01,efetivo,812.44\n";
  const r = montarLeads(csv, opcoes);
  const l = r.registros[0]!;
  assert.equal(l.extras["data_de_concessao"], "2024-03-01");
  assert.equal(l.extras["vinculo"], "efetivo");
  assert.equal(l.extras["valor_da_parcela"], "812.44");
  assert.equal(r.colunasPreservadas, 3);
  assert.equal(l.renda_estimada, null);
});

test("campo a mais que o cabeçalho não é jogado fora", () => {
  // CSV separado por vírgula com número decimal entre aspas: o parser tem de
  // manter `812,44` inteiro, e um valor solto a mais tem de ser preservado.
  const comAspas = montarLeads("telefone,valor\n79999990001,\"812,44\"\n", opcoes);
  assert.equal(comAspas.registros[0]?.extras["valor"], "812,44");

  const estourada = montarLeads("telefone,nome\n79999990001,Maria,812\n", opcoes);
  assert.equal(estourada.registros[0]?.extras["sobrante_3"], "812");
  assert.ok(estourada.avisos.some((a) => a.includes("sobrante_N")));
});

test("linhas sem telefone válido não entram na fila", () => {
  const csv = "telefone,nome\n,Maria\n12345,Jose\n79999990001,Rita\n";
  const r = montarLeads(csv, opcoes);
  assert.equal(r.registros.length, 1);
  assert.equal(r.registros[0]?.nome, "Rita");
  assert.deepEqual(r.ignorados.map((i) => i.linha), [2, 3]);
  assert.match(r.ignorados[0]?.motivo ?? "", /telefone/);
});

test("duplicata no mesmo arquivo é contada e ignorada", () => {
  const csv = "telefone,nome\n79999990001,Maria\n79999990001,Maria repetida\n";
  const r = montarLeads(csv, opcoes);
  assert.equal(r.registros.length, 1);
  assert.equal(r.ignorados[0]?.motivo, "duplicata da linha 2");
  assert.ok(r.avisos.some((a) => a.includes("repetida")));
});

test("CPF inválido é descartado sem descartar o lead", () => {
  const csv = "telefone,nome,cpf\n79999990001,Maria,12345678900\n79999990002,Jose,11111111111\n";
  // 12345678900 e 11111111111 passam no comprimento mas não no dígito verificador
  const r = montarLeads(csv, opcoes);
  assert.equal(r.registros.length, 2);
  assert.equal(r.registros[0]?.cpf, null);
  assert.equal(r.registros[1]?.cpf, null);
  assert.ok(r.avisos.some((a) => a.includes("2 CPF")));
});

test("cpfValido aceita dígito verificador real e rejeita massa de dígitos", () => {
  assert.equal(cpfValido("529.982.247-25"), true);
  assert.equal(cpfValido("52998224725"), true);
  assert.equal(cpfValido("52998224726"), false);
  assert.equal(cpfValido("11111111111"), false);
  assert.equal(cpfValido(""), false);
});

test("telefone: DDI 00, +55 já presente, e 8/9 dígitos", () => {
  assert.equal(normalizarTelefone("(79) 99999-0001"), "+5579999990001");
  assert.equal(normalizarTelefone("00 55 79 999990001"), "+5579999990001");
  assert.equal(normalizarTelefone("+5579999990001"), "+5579999990001");
  assert.equal(normalizarTelefone("7933334444"), "+557933334444");
  assert.equal(normalizarTelefone("99990001"), "+99990001");
  assert.equal(normalizarTelefone("abc"), "+");
});

test("moeda: ponto é milhar quando tem vírgula, e vírgula é decimal", () => {
  assert.equal(moeda("R$ 1.234,56"), 1234.56);
  assert.equal(moeda("350,00"), 350);
  assert.equal(moeda("1.234"), 1234);
  assert.equal(moeda("1234.56"), 1234.56);
  assert.equal(moeda("350.5"), 350.5);
  assert.equal(moeda(""), null);
  assert.equal(moeda("—"), null);
});

test("BOM e CRLF não quebram o parser", () => {
  const csv = "﻿telefone,nome\r\n79999990001,Maria\r\n";
  const leitura = lerPlanilha(csv);
  assert.equal(leitura.temCabecalho, true);
  assert.deepEqual(leitura.cabecalhos, ["telefone", "nome"]);
  assert.equal(leitura.linhas.length, 1);
  const r = montarLeads(csv, opcoes);
  assert.equal(r.registros[0]?.nome, "Maria");
});

test("a 1ª linha não é tratada como cabeçalho quando parece telefone", () => {
  const leitura = lerPlanilha("79999990001,Maria,12345678901");
  assert.equal(leitura.temCabecalho, false);
  assert.equal(leitura.linhas.length, 1);
});
