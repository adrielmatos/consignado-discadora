"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

function digits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function extractBank(row: any): string {
  const extras = row?.dados_extras && typeof row.dados_extras === "object" ? row.dados_extras : {};
  const imported = extras?._importacao;
  const directKeys = [
    "Banco", "BANCO", "banco", "Banco Atual", "Banco do Benefício",
    "Banco do Beneficio", "Instituição Financeira", "Instituicao Financeira", "Bank"
  ];

  for (const key of directKeys) {
    const value = extras?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  if (imported && typeof imported.banco === "string" && imported.banco.trim()) {
    return imported.banco.trim();
  }

  const produto = String(row?.produto || "");
  const match = produto.match(/Banco\s*:\s*([^•|]+)/i);
  return match?.[1]?.trim() || "";
}

function findPhone(): string {
  const node = document.querySelector(".dialNumber");
  return digits(node?.textContent || "");
}

const cacheKey = (phone: string) => `ak:bank:${phone}`;

export default function BankBadge() {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastPhone = "";

    // Accessibility layer is injected here so it is independent of the
    // deployment/cache state of global CSS imports. It changes presentation
    // only; no CRM, dialer or Supabase behavior is modified.
    const style = document.createElement("style");
    style.id = "ak-accessibility-typography";
    style.textContent = `
      html{font-size:18px}
      .sidebar nav button{font-size:14px;min-height:42px}
      .sidebar nav button i{font-size:16px}.operator b{font-size:14px}
      .operator small,.sidefoot{font-size:12px}.online,.eyebrow{font-size:12px}
      .alert{font-size:14px}.header h1{font-size:32px}
      .header p,.heroPanel p,.panelTitle p,.toolbar p{font-size:14px}
      .panelTitle h3,.toolbar h3{font-size:18px}.metric span,.metric small{font-size:13px}
      .flow b{font-size:12px}.flow span{font-size:14px}.flow small{font-size:12px}
      .modeBar b{font-size:14px}.modeBar small{font-size:13px}.modeBtns button{font-size:13px;padding:10px 13px}
      .dialHeader{font-size:14px}.dialHeader b{font-size:18px}.person h2{font-size:32px}
      .person p{font-size:15px}.dialNumber{font-size:28px}
      .callBtn,.dangerBtn{font-size:14px;padding:12px 16px}
      .resultGrid button{font-size:14px;min-height:50px;padding:13px 9px}.info,.notice{font-size:14px}
      .search{font-size:14px;padding:12px 13px}.tableWrap th,.tableWrap td{font-size:13px;padding:13px 14px}
      .tableWrap th{font-size:11px}.tableWrap td small{font-size:11px}.pill{font-size:12px}
      .tableBtn{font-size:12px;padding:8px 10px}.pagination{font-size:12px}.kanbanHead{font-size:13px}
      .leadCard{padding:11px}.leadCard b{font-size:13px}.leadCard small{font-size:11px}
      .campaignCard b{font-size:14px}.campaignCard small{font-size:12px}.featureTop span{font-size:12px}
      .feature h3{font-size:18px}.feature p{font-size:14px}.barRow,.barRow b{font-size:13px}
      .drawer h2{font-size:28px}.drawer p{font-size:14px}.drawerPhone{font-size:21px}
      .drawerSection>b{font-size:12px}.drawerSection button{font-size:13px;padding:11px}
      .drop small{font-size:12px}.field label{font-size:13px}.field input{font-size:14px;padding:12px}
      .check{font-size:12px}.authHero p,.auth small{font-size:14px}.auth input,.auth button{font-size:15px}
      @media(max-width:700px){html{font-size:17px}.header h1{font-size:28px}.person h2{font-size:27px}.dialNumber{font-size:24px}.tableWrap th,.tableWrap td{font-size:12px}}
    `;
    if (!document.getElementById(style.id)) document.head.appendChild(style);

    const clearBadge = () => {
      document.querySelectorAll("[data-ak-bank-badge]").forEach((node) => node.remove());
    };

    const render = (bank: string) => {
      clearBadge();
      if (!bank || disposed) return;
      const person = document.querySelector(".person");
      if (!person) return;
      const target = person.querySelector("p");
      if (!target) return;

      const badge = document.createElement("div");
      badge.dataset.akBankBadge = "true";
      badge.textContent = `🏦 ${bank}`;
      badge.style.cssText = [
        "display:inline-flex","align-items:center","margin-top:6px","padding:6px 10px",
        "border:1px solid rgba(59,130,246,.28)","border-radius:999px","background:rgba(59,130,246,.08)",
        "color:inherit","font-size:14px","font-weight:800","line-height:1.2"
      ].join(";");
      target.insertAdjacentElement("afterend", badge);
    };

    const readCache = (phone: string) => {
      try { return sessionStorage.getItem(cacheKey(phone)) || ""; } catch { return ""; }
    };

    const writeCache = (phone: string, bank: string) => {
      if (!phone || !bank) return;
      try { sessionStorage.setItem(cacheKey(phone), bank); } catch { /* cache is optional */ }
    };

    const load = async () => {
      const phone = findPhone();
      if (!phone) { lastPhone = ""; clearBadge(); return; }
      const badgeExists = Boolean(document.querySelector("[data-ak-bank-badge]"));
      if (phone === lastPhone && badgeExists) return;
      lastPhone = phone;

      const cachedBank = readCache(phone);
      if (cachedBank) render(cachedBank); else clearBadge();
      if (!supabase) return;

      const { data: phones, error: phoneError } = await supabase
        .from("telefones").select("lead_id").eq("numero_normalizado", phone).eq("ativo", true).limit(1);
      if (disposed || phoneError || !phones?.[0]?.lead_id) return;

      const { data: lead, error: leadError } = await supabase
        .from("leads").select("produto,dados_extras").eq("id", phones[0].lead_id).maybeSingle();
      if (disposed || leadError) return;
      const bank = extractBank(lead);
      writeCache(phone, bank);
      render(bank);
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void load(), 120);
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    schedule();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      observer.disconnect();
      clearBadge();
      document.getElementById(style.id)?.remove();
    };
  }, []);

  return null;
}
