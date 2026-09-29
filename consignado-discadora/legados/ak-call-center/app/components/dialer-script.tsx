"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "ak-call-center:scripts:v1";
const DEFAULT_SCRIPTS: Record<string, string> = {
  SIAPE: `ABERTURA
"Oi, tudo bem? Falo com [NOME]? Aqui é [SEU NOME], da A&K Soluções Financeiras. Prometo ser rápido. Eu trabalho com atendimento de crédito para servidor federal do SIAPE. Posso te explicar o motivo da ligação?"

MOTIVO
"Estou entrando em contato para verificar se existe alguma condição de crédito, redução de parcela ou outra opção disponível para o seu perfil. A consulta é uma simulação e não garante aprovação. Se fizer sentido, eu verifico as opções e te explico antes de qualquer contratação."

QUALIFICAÇÃO
"Hoje você já possui algum consignado ou cartão consignado? E está procurando reduzir parcela, liberar um valor ou apenas conhecer as condições?"

FECHAMENTO
"Posso fazer a simulação e te enviar as condições pelo WhatsApp para você analisar com calma?"`,
  INSS: `ABERTURA
"Oi, tudo bem? Falo com [NOME]? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar com você por um minutinho?"

MOTIVO
"Eu trabalho com atendimento de crédito para aposentados e pensionistas do INSS. Estou entrando em contato para verificar se existe alguma opção disponível para o seu perfil, como novo crédito, refinanciamento ou portabilidade, quando elegível."

QUALIFICAÇÃO
"Você já possui algum consignado hoje ou está procurando uma opção nova? O que seria mais interessante para você: reduzir parcela ou verificar possibilidade de receber um valor?"

FECHAMENTO
"Se você quiser, posso te enviar a simulação pelo WhatsApp para conferir tudo com calma antes de tomar qualquer decisão."`,
  "BPC/LOAS": `ABERTURA
"Oi, tudo bem? Falo com [NOME]? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso explicar rapidamente o motivo da ligação?"

MOTIVO
"Nós fazemos atendimento de soluções de crédito e quero verificar se existe alguma opção compatível com o seu benefício e com as regras atuais. Primeiro fazemos a análise; não é promessa de aprovação."

QUALIFICAÇÃO
"Você já possui algum contrato ou cartão relacionado ao benefício? Está procurando um valor novo, reduzir parcela ou apenas consultar as possibilidades?"

FECHAMENTO
"Se houver uma opção adequada, eu te apresento as condições completas para você avaliar sem compromisso."`,
  FGTS: `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar rapidinho sobre uma possibilidade relacionada ao seu FGTS?"

MOTIVO
"Quero verificar se existe uma opção disponível para antecipação do saque-aniversário do FGTS, conforme as regras e a análise da instituição. Primeiro fazemos a simulação para você conhecer as condições."

QUALIFICAÇÃO
"Você utiliza o saque-aniversário e já fez alguma antecipação anteriormente?"

FECHAMENTO
"Posso verificar as condições e te enviar valor, taxas e demais informações para você analisar antes de contratar?"`,
  CLT: `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar um minutinho?"

MOTIVO
"Faço atendimento de soluções de crédito para trabalhadores do setor privado. Quero verificar se existe alguma opção disponível para o seu perfil, conforme as regras da modalidade e da instituição."

QUALIFICAÇÃO
"Você está trabalhando atualmente com carteira assinada? Está procurando um valor novo, organizar parcelas ou apenas conhecer as condições?"

FECHAMENTO
"Se quiser, faço uma simulação e te mostro valor, parcela, prazo e condições antes de qualquer contratação."`,
  "Consignado Público": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Eu trabalho com atendimento de crédito consignado para servidores públicos. Posso explicar rapidinho?"

MOTIVO
"Quero verificar se há alguma condição disponível para o seu vínculo, como novo crédito, refinanciamento, portabilidade ou cartão, quando elegível."

FECHAMENTO
"Faço a análise e te apresento as condições completas. Você decide depois de conferir tudo."`,
  "Consignado Privado": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar um minutinho?"

MOTIVO
"Atendemos crédito consignado para trabalhadores de empresas privadas, sujeito às regras do convênio e da instituição. Quero verificar se existe alguma condição para o seu perfil."

QUALIFICAÇÃO
"Você trabalha atualmente com carteira assinada? Está buscando crédito novo ou alguma alternativa para uma parcela que já possui?"

FECHAMENTO
"Posso consultar as possibilidades e te passar as condições antes de qualquer decisão?"`,
  "Crédito Pessoal": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso te explicar rapidamente o motivo da ligação?"

MOTIVO
"Trabalhamos com opções de crédito pessoal sujeitas à análise da instituição. Quero entender o que você precisa e verificar se existe alguma condição compatível."

QUALIFICAÇÃO
"Você está buscando um valor específico ou quer comparar opções de parcela e prazo?"

FECHAMENTO
"Posso fazer uma simulação e te mostrar as condições para você comparar com calma?"`,
  "Cartão Consignado": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar rapidinho sobre uma opção de cartão consignado?"

MOTIVO
"Quero verificar se você é elegível a uma opção de cartão consignado e explicar como funcionam limite, desconto e demais condições antes de qualquer contratação."

FECHAMENTO
"Se houver uma opção disponível, eu te explico todos os custos e condições para você avaliar."`,
  "Cartão Benefício": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso explicar uma opção de cartão benefício?"

MOTIVO
"Quero verificar se existe uma opção disponível para o seu perfil e explicar como funciona, incluindo as condições, descontos e custos aplicáveis."

FECHAMENTO
"Posso consultar a elegibilidade e te apresentar as condições antes de você decidir?"`,
  Seguros: `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar um minutinho?"

MOTIVO
"Também trabalhamos com opções de proteção, como assistência médica, residencial e funeral. Quero entender se alguma dessas soluções faz sentido para você."

FECHAMENTO
"Se tiver interesse, eu te apresento cobertura, preço e condições para você comparar antes de contratar."`,
  "Energia Solar": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso te explicar uma alternativa para reduzir o custo da energia?"

MOTIVO
"Trabalhamos com uma solução de energia por assinatura/parceria que pode reduzir a conta sem a instalação de placas no imóvel, conforme disponibilidade e regras da oferta."

FECHAMENTO
"Posso verificar se existe disponibilidade para sua conta e te explicar a economia e as condições antes de você decidir?"`,
  "Abertura de conta Santander": `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar rapidinho?"

MOTIVO
"Nós também fazemos indicação para abertura de conta Santander. Quero entender se você teria interesse em conhecer as condições e benefícios da conta."

FECHAMENTO
"Se tiver interesse, eu te explico o processo e os benefícios informados pela instituição, sem compromisso."`,
  Atendimento: `ABERTURA
"Oi, [NOME], tudo bem? Aqui é [SEU NOME], da A&K Soluções Financeiras. Posso falar um minutinho?"

MOTIVO
"Estou entrando em contato para entender se existe alguma solução financeira que faça sentido para você. Eu faço algumas perguntas rápidas e, se houver uma opção, te explico as condições."

FECHAMENTO
"Se fizer sentido, seguimos com a simulação. Se não fizer, sem problema."`,
};

function normalizeProduct(value: string) {
  const p = value.toLowerCase().trim();
  const aliases: [string, string][] = [
    ["siape", "SIAPE"], ["inss", "INSS"], ["bpc", "BPC/LOAS"], ["loas", "BPC/LOAS"],
    ["fgts", "FGTS"], ["clt", "CLT"], ["consignado público", "Consignado Público"],
    ["consignado privado", "Consignado Privado"], ["crédito pessoal", "Crédito Pessoal"],
    ["cartão consignado", "Cartão Consignado"], ["cartao consignado", "Cartão Consignado"],
    ["cartão benefício", "Cartão Benefício"], ["cartao beneficio", "Cartão Benefício"],
    ["seguro", "Seguros"], ["seguros", "Seguros"], ["energia solar", "Energia Solar"],
    ["santander", "Abertura de conta Santander"],
  ];
  return aliases.find(([needle]) => p.includes(needle))?.[1] || value.trim() || "Atendimento";
}

function readSavedScripts() {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, string>; } catch { return {}; }
}

export default function DialerScript() {
  useEffect(() => {
    let disposed = false;
    let timer: number | undefined;
    let lastKey = "";

    const remove = () => document.querySelectorAll("[data-ak-dialer-script]").forEach((node) => node.remove());
    const escapeHtml = (value: string) => value.replace(/[&<>\"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[char] || char));

    const render = (leadName: string, phone: string, productRaw: string) => {
      if (disposed) return;
      const grid = document.querySelector(".dialGrid");
      const callPanel = grid?.querySelector(".callPanel");
      if (!grid || !callPanel) { remove(); return; }
      const product = normalizeProduct(productRaw);
      const saved = readSavedScripts();
      const script = saved[product] || DEFAULT_SCRIPTS[product] || saved.Atendimento || DEFAULT_SCRIPTS.Atendimento;
      const key = `${leadName}|${phone}|${product}|${script}`;
      if (key === lastKey && document.querySelector("[data-ak-dialer-script]")) return;
      lastKey = key;
      remove();

      const card = document.createElement("section");
      card.dataset.akDialerScript = "true";
      card.className = "panel akDialerScript";
      card.style.cssText = "padding:22px;align-self:start;max-height:calc(100vh - 210px);overflow:auto;position:sticky;top:18px";
      card.innerHTML = `<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px"><div><div style="font-size:12px;font-weight:800;letter-spacing:.08em;opacity:.7">SCRIPT DO DISCADOR</div><h3 style="font-size:22px;margin:4px 0">${escapeHtml(product)}</h3><div style="font-size:14px;opacity:.8">Cliente: <b>${escapeHtml(leadName)}</b></div></div><span style="padding:6px 9px;border-radius:999px;background:rgba(59,130,246,.1);font-size:12px;font-weight:800">${escapeHtml(phone)}</span></div><textarea readonly style="width:100%;min-height:390px;resize:vertical;border:1px solid rgba(148,163,184,.25);border-radius:12px;padding:14px;font:inherit;line-height:1.55;background:rgba(15,23,42,.03);color:inherit">${escapeHtml(script.replaceAll("[NOME]", leadName))}</textarea><div style="margin-top:12px;font-size:12px;line-height:1.5;opacity:.7">Script sincronizado com Operação 360. Para alterar, edite e salve o script do produto em <b>Operação 360 → Script de ligação</b>.</div>`;
      grid.insertBefore(card, callPanel.nextSibling);
    };

    const load = async () => {
      const phone = String(document.querySelector(".dialNumber")?.textContent || "").replace(/\D/g, "");
      const name = String(document.querySelector(".person h2")?.textContent || "").trim();
      if (!phone || !name || !document.querySelector(".callPanel")) { remove(); lastKey = ""; return; }
      if (!supabase) { render(name, phone, "Atendimento"); return; }
      const { data: phones } = await supabase.from("telefones").select("lead_id").eq("numero_normalizado", phone).eq("ativo", true).limit(1);
      const leadId = phones?.[0]?.lead_id;
      if (!leadId) { render(name, phone, "Atendimento"); return; }
      const { data: lead } = await supabase.from("leads").select("produto,dados_extras").eq("id", leadId).maybeSingle();
      const imported = lead?.dados_extras?._importacao || {};
      const product = String(imported.produto_original || lead?.produto || "Atendimento").replace(/\s*•\s*Banco:\s*.+$/i, "").trim();
      render(name, phone, product || "Atendimento");
    };

    const schedule = () => { window.setTimeout(() => void load(), 80); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();
    timer = window.setInterval(() => void load(), 1200);
    const onStorage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) { lastKey = ""; void load(); } };
    window.addEventListener("storage", onStorage);

    return () => { disposed = true; if (timer !== undefined) window.clearInterval(timer); observer.disconnect(); window.removeEventListener("storage", onStorage); remove(); };
  }, []);

  return null;
}
