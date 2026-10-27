"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { 
  Calculator, 
  TrendingDown, 
  Sparkles, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  DollarSign, 
  Users 
} from "lucide-react";

interface RoiCalculatorProps {
  onOpenDemoModal: (extraMessage?: string) => void;
}

export default function RoiCalculator({ onOpenDemoModal }: RoiCalculatorProps) {
  const [operators, setOperators] = useState(5);
  const [voipCostPerAgent, setVoipCostPerAgent] = useState(350);

  // Traditional VoIP calculation (Plan cost + Minutes + Taxes)
  const monthlyVoipTotal = operators * voipCostPerAgent;
  const annualVoipTotal = monthlyVoipTotal * 12;

  // Discadora Consignado Pro cost (Fixed software, 0 minutes cost)
  let monthlyOurCost = 97;
  if (operators > 1 && operators <= 5) {
    monthlyOurCost = 247;
  } else if (operators > 5) {
    monthlyOurCost = 247 + (operators - 5) * 45;
  }
  const annualOurCost = monthlyOurCost * 12;

  // Savings
  const monthlySavings = Math.max(0, monthlyVoipTotal - monthlyOurCost);
  const annualSavings = monthlySavings * 12;
  const savingsPercent = Math.round((monthlySavings / monthlyVoipTotal) * 100);

  const handleCtaClick = () => {
    const msg = `Olá! Fiz a simulação na calculadora para ${operators} operadores e vi que posso economizar ${formatCurrency(
      annualSavings
    )} por ano. Gostaria de agendar a demonstração da Discadora Consignado Pro!`;
    onOpenDemoModal(msg);
  };

  return (
    <section id="calculadora" className="py-20 md:py-28 relative bg-navy-950 overflow-hidden">
      {/* Background Accent Gradients */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-brand-royal/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-amber-500/10 blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Calculator className="w-3.5 h-3.5" />
            <span>Simulador de Economia Real</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Veja Quanto Dinheiro Você Está{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              Deixando no Ralo do VoIP
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Discadores tradicionais cobram mensalidade por posto mais cobrança por segundo falado.
            Com a Discadora Consignado Pro, sua chamada sai pelo chip ilimitado do celular dos operadores.
          </p>
        </div>

        {/* Calculator Grid Box */}
        <div className="grid lg:grid-cols-12 gap-8 items-stretch max-w-5xl mx-auto">
          {/* Sliders Input Panel */}
          <div className="lg:col-span-7 bg-navy-900/90 rounded-2xl p-6 sm:p-8 border border-navy-700/80 shadow-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-navy-800 pb-4 mb-6">
                <span className="text-sm font-bold uppercase text-slate-300 tracking-wider flex items-center gap-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span>Configure Sua Operação</span>
                </span>
                <span className="text-xs text-amber-400 font-semibold bg-amber-500/10 px-2.5 py-0.5 rounded border border-amber-500/20">
                  Cálculo Instantâneo
                </span>
              </div>

              {/* Slider 1: Operators */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>Quantos operadores discam na sua equipe?</span>
                  </label>
                  <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono bg-navy-950 px-3 py-1 rounded-lg border border-navy-800">
                    {operators} {operators === 1 ? "operador" : "operadores"}
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="40"
                  step="1"
                  value={operators}
                  onChange={(e) => setOperators(Number(e.target.value))}
                  className="w-full h-2.5 bg-navy-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2 font-mono">
                  <span>1 op</span>
                  <span>10 ops</span>
                  <span>20 ops</span>
                  <span>30 ops</span>
                  <span>40+ ops</span>
                </div>
              </div>

              {/* Slider 2: Current VoIP Cost Per Agent */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-sm font-semibold text-white flex items-center gap-2">
                    <span>Gasto médio mensal por operador com VoIP / PABX?</span>
                  </label>
                  <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono bg-navy-950 px-3 py-1 rounded-lg border border-navy-800">
                    {formatCurrency(voipCostPerAgent)}
                    <span className="text-xs text-slate-400 font-normal">/mês</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="150"
                  max="650"
                  step="25"
                  value={voipCostPerAgent}
                  onChange={(e) => setVoipCostPerAgent(Number(e.target.value))}
                  className="w-full h-2.5 bg-navy-950 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="flex justify-between text-xs text-slate-400 mt-2 font-mono">
                  <span>R$ 150 (básico)</span>
                  <span>R$ 350 (médio)</span>
                  <span>R$ 550+ (alto tráfego)</span>
                </div>
              </div>
            </div>

            {/* Note */}
            <div className="pt-4 border-t border-navy-800/80 text-xs text-slate-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Considerando custo de minutos VoIP, mensalidade de licença e tarifas Anatel.
              </span>
            </div>
          </div>

          {/* Results Summary Box (Mix Mateus High-Impact Display) */}
          <div className="lg:col-span-5 bg-gradient-to-br from-brand-royal/90 via-navy-900 to-navy-950 rounded-2xl p-6 sm:p-8 border-2 border-amber-500/50 shadow-2xl shadow-amber-500/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                  Resultado da Simulação
                </span>
                <span className="bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2 py-0.5 rounded border border-emerald-500/30">
                  {savingsPercent}% de Redução
                </span>
              </div>

              {/* Comparison Numbers */}
              <div className="space-y-3 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400">Gasto Atual Estimado no VoIP:</span>
                  <span className="font-mono text-red-400 font-semibold line-through">
                    {formatCurrency(monthlyVoipTotal)}/mês
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-200 font-medium">Discadora Consignado Pro:</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {formatCurrency(monthlyOurCost)}/mês
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm border-t border-navy-800 pt-2 font-semibold">
                  <span className="text-amber-300">Economia Todo Mês:</span>
                  <span className="font-mono text-amber-300 font-black text-lg">
                    {formatCurrency(monthlySavings)}
                  </span>
                </div>
              </div>

              {/* Big Annual Savings Display */}
              <div className="bg-navy-950/80 rounded-xl p-4 sm:p-5 border border-amber-500/40 text-center mb-6">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1">
                  Sua Economia Anual Estimada
                </span>
                <div className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400 font-mono tracking-tight">
                  {formatCurrency(annualSavings)}
                </div>
                <span className="text-[11px] text-emerald-400 font-medium mt-1 inline-block">
                  💰 Dinheiro que fica no caixa da sua empresa
                </span>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleCtaClick}
              className="btn-cta-vibrant w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-extrabold flex items-center justify-center gap-2 group"
            >
              <Zap className="w-4 h-4 text-navy-950 fill-navy-950" />
              <span>GARANTIR ESSA ECONOMIA NO WHATSAPP</span>
              <ArrowRight className="w-4 h-4 text-navy-950 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
