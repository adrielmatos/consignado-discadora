import { siteConfig } from "@/config/site";
import { Check, Zap, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

interface PricingProps {
  onOpenDemoModal: (extraMessage?: string) => void;
}

export default function Pricing({ onOpenDemoModal }: PricingProps) {
  return (
    <section id="planos" className="py-20 md:py-28 bg-navy-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Zap className="w-3.5 h-3.5" />
            <span>Preço Fixo Sem Surpresas</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Planos Transparentes para{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Qualquer Tamanho de Equipe
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Você paga apenas pelo software. Nunca cobramos por minuto discado nem por volume de chamadas.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          {siteConfig.plans.map((plan) => {
            const isHighlight = plan.highlight;
            return (
              <div
                key={plan.id}
                className={`rounded-2xl flex flex-col justify-between transition-all duration-300 relative ${
                  isHighlight
                    ? "bg-gradient-to-b from-brand-royal/40 via-navy-900 to-navy-950 border-2 border-amber-400 shadow-2xl shadow-amber-500/20 md:-translate-y-2"
                    : "bg-navy-900/80 border border-navy-700/80 hover:border-brand-blue/50"
                }`}
              >
                {/* Highlight Badge */}
                {plan.badge && (
                  <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                    <span
                      className={`text-[11px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full shadow-lg ${
                        isHighlight
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 text-navy-950 font-extrabold"
                          : "bg-navy-800 text-slate-300 border border-navy-700"
                      }`}
                    >
                      {plan.badge}
                    </span>
                  </div>
                )}

                <div className="p-6 sm:p-8">
                  {/* Title & Subtitle */}
                  <h3 className="text-xl font-bold text-white mb-1">{plan.name}</h3>
                  <p className="text-xs text-slate-400 mb-6 min-h-[32px]">
                    {plan.subtitle}
                  </p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1 mb-6 border-b border-navy-800 pb-6">
                    <span className="text-sm font-semibold text-slate-400">R$</span>
                    <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                      {plan.price}
                    </span>
                    <span className="text-sm text-slate-400 font-medium">
                      {plan.period}
                    </span>
                  </div>

                  {/* Feature List */}
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="text-xs sm:text-sm text-slate-300 flex items-start gap-2.5">
                        <Check
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            isHighlight ? "text-amber-400 stroke-[3]" : "text-emerald-400 stroke-[2.5]"
                          }`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Card CTA */}
                <div className="p-6 sm:p-8 pt-0">
                  <button
                    onClick={() => {
                      const msg = `Olá! Gostaria de contratar ou testar o ${plan.name} (R$ ${plan.price}/mês) da Discadora Consignado Pro.`;
                      onOpenDemoModal(msg);
                    }}
                    className={`w-full py-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all ${
                      isHighlight
                        ? "btn-cta-vibrant"
                        : "bg-navy-850 hover:bg-navy-800 text-white border border-navy-700 hover:border-brand-blue"
                    }`}
                  >
                    <span>{plan.ctaText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <p className="text-[11px] text-center text-slate-400 mt-2">
                    Sem fidelidade • Cancele a qualquer momento
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom enterprise banner */}
        <div className="mt-12 max-w-4xl mx-auto bg-navy-900/60 rounded-xl p-5 border border-navy-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-navy-850 flex items-center justify-center text-amber-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">
                Precisa de uma proposta customizada para mais de 30 operadores?
              </h4>
              <p className="text-xs text-slate-400">
                Atendemos grandes correspondentes com servidor dedicado, regras de rodízio avançadas e onboarding VIP.
              </p>
            </div>
          </div>
          <button
            onClick={() =>
              onOpenDemoModal(
                "Olá! Possuo uma operação com mais de 30 operadores e gostaria de uma proposta personalizada para a Discadora Consignado Pro."
              )
            }
            className="text-xs font-bold text-amber-400 hover:text-amber-300 whitespace-nowrap px-4 py-2 rounded-lg bg-navy-850 border border-amber-500/30 hover:border-amber-400 transition-colors"
          >
            Falar com Consultor Enterprise →
          </button>
        </div>
      </div>
    </section>
  );
}
