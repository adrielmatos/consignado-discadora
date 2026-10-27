import { Check, X, Sparkles, HelpCircle } from "lucide-react";

interface ComparisonTableProps {
  onOpenDemoModal: () => void;
}

const comparisonRows = [
  {
    criterion: "Custo por Minuto Falado",
    us: "R$ 0,00 (Usa plano ilimitado do chip)",
    usPositive: true,
    them: "R$ 0,08 a R$ 0,35 por minuto",
    themPositive: false,
    detail: "Em 100h de ligação/mês, o VoIP tradicional custa uma fortuna em minutos extras.",
  },
  {
    criterion: "Bloqueio e Restrição Anatel 0303",
    us: "Livre (Ligação móvel natural celular-celular)",
    usPositive: true,
    them: "Alto risco de bloqueio e descarte de chamadas",
    themPositive: false,
    detail: "Clientes atendem muito mais chamadas originadas de números móveis comuns.",
  },
  {
    criterion: "Esteira de Anuência Meu INSS",
    us: "Nativa com alerta de expiração e contagem regressiva",
    usPositive: true,
    them: "Não possui (CRM genérico)",
    themPositive: false,
    detail: "O funil acompanha os dias restantes para o cliente assinar antes do cancelamento.",
  },
  {
    criterion: "Simulador de Margem INSS em Tela",
    us: "Integrado (bloqueia parcela acima do teto)",
    usPositive: true,
    them: "Requer calculadora externa ou sistema à parte",
    themPositive: false,
    detail: "O atendente calcula a proposta sem sair da chamada, com dados do benefício.",
  },
  {
    criterion: "Roteiro de Vendas com Objeções",
    us: "Checklist dinâmico + Cartões de Objeções",
    usPositive: true,
    them: "Texto estático ou inexistente",
    themPositive: false,
    detail: "Audita a aderência do operador e dá respostas prontas durante a negociação.",
  },
  {
    criterion: "Cadência & Renitência por Disposição",
    us: "8 disposições com intervalo e hora preferencial",
    usPositive: true,
    them: "Cadência fixa simples ou inexistente",
    themPositive: false,
    detail: "Rechama no horário em que o lead tem maior probabilidade de atender.",
  },
  {
    criterion: "Equipamento Necessário",
    us: "PC Windows + Qualquer celular que o operador já tem",
    usPositive: true,
    them: "Servidor PBX, gateways GSM ou troncos SIP caros",
    themPositive: false,
    detail: "Basta parear via Bluetooth/Wi-Fi pelo aplicativo nativo do Windows.",
  },
];

export default function ComparisonTable({ onOpenDemoModal }: ComparisonTableProps) {
  return (
    <section id="comparativo" className="py-20 md:py-28 bg-navy-900/60 relative border-y border-navy-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Comparativo Transparente</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Por Que Somos a Escolha Certa para{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-orange-400">
              Operações de Consignado
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Compare recurso por recurso e entenda a diferença entre uma discadora genérica de VoIP e uma solução feita sob medida para crédito consignado.
          </p>
        </div>

        {/* Table Container */}
        <div className="max-w-5xl mx-auto bg-navy-950 rounded-2xl border border-navy-700/80 shadow-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-navy-800 bg-navy-900/90">
                  <th className="py-5 px-6 text-sm font-bold text-slate-300 uppercase tracking-wider w-2/5">
                    Critério / Funcionalidade
                  </th>
                  <th className="py-5 px-6 text-sm font-extrabold text-amber-400 bg-brand-royal/30 border-x border-amber-500/30 w-3/10 text-center">
                    <span className="block text-white text-base">Discadora Consignado Pro</span>
                    <span className="text-[11px] font-normal text-amber-300">Nossa Solução</span>
                  </th>
                  <th className="py-5 px-6 text-sm font-bold text-slate-400 w-3/10 text-center">
                    <span className="block text-slate-300">Discadoras VoIP Tradicionais</span>
                    <span className="text-[11px] font-normal text-slate-500">(3C Plus, JoyTec, PABX Nuvem)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/80 text-sm">
                {comparisonRows.map((row, index) => (
                  <tr
                    key={index}
                    className="hover:bg-navy-900/40 transition-colors"
                  >
                    {/* Criterion & Detail */}
                    <td className="py-4 px-6 text-white font-medium">
                      <div>{row.criterion}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{row.detail}</div>
                    </td>

                    {/* Us (Winner) */}
                    <td className="py-4 px-6 bg-brand-royal/15 border-x border-amber-500/20 text-center">
                      <div className="inline-flex items-center gap-1.5 font-bold text-emerald-300 text-xs sm:text-sm">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 stroke-[3]" />
                        <span>{row.us}</span>
                      </div>
                    </td>

                    {/* Them */}
                    <td className="py-4 px-6 text-center text-slate-400">
                      <div className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
                        <X className="w-4 h-4 text-red-400 shrink-0 stroke-[2.5]" />
                        <span>{row.them}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table Bottom Footer CTA */}
          <div className="p-6 bg-navy-900/90 border-t border-navy-800 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-xs sm:text-sm text-slate-300 text-center sm:text-left">
              💡 Chega de pagar tarifas desnecessárias de telefonia no seu correspondente.
            </span>
            <button
              onClick={onOpenDemoModal}
              className="btn-cta-vibrant px-6 py-3 rounded-xl text-xs sm:text-sm font-black whitespace-nowrap"
            >
              MIGRAR PARA A DISCADORA CONSIGNADO PRO
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
