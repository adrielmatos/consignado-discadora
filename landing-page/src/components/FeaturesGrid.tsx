import { 
  Smartphone, 
  Workflow, 
  Calculator, 
  BookOpenCheck, 
  Repeat, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight 
} from "lucide-react";

interface FeaturesGridProps {
  onOpenDemoModal: () => void;
}

const features = [
  {
    icon: Smartphone,
    title: "Discador pelo Celular (Phone Link)",
    badge: "Zero Custo VoIP",
    description:
      "Automatiza o 'Vincular ao Windows' para discar pelo chip ilimitado do seu operador. Sem tarifas por minuto, sem bloqueios de operadora e sem complicação de PABX.",
    bullets: ["100% no chip do celular", "Compatível com Android e iPhone", "Zero tarifas de telefonia"],
    image: "/mockups/10-operador-fila.png",
  },
  {
    icon: Workflow,
    title: "Esteira de Anuência Meu INSS",
    badge: "Foco no Fechamento",
    description:
      "O funil que realmente importa no consignado: Qualificar → Registrar proposta → Cobrar anuência no Meu INSS com contagem regressiva de dias para expirar.",
    bullets: ["Alerta de anuência vencendo", "Kanban com esteira visual", "Tarefas e retornos agendados"],
    image: "/mockups/02-crm-esteira.png",
  },
  {
    icon: Calculator,
    title: "Simulador de Margem Integrado",
    badge: "Blindagem de Proposta",
    description:
      "Calcula a parcela máxima sobre a margem real do benefício do INSS em tempo real. O sistema recusa parcelas acima do teto, evitando contratos devolvidos.",
    bullets: ["Cálculo automático de margem", "Recusa erros na proposta", "Gera proposta pronta"],
    image: "/mockups/12b-operador-simulador.png",
  },
  {
    icon: BookOpenCheck,
    title: "Roteiro & Objeções ao Vivo",
    badge: "Mais Conversão",
    description:
      "Roteiro interativo direto na tela da chamada com checklist de passos obrigatórios e cartões de resposta imediata para as principais objeções do cliente.",
    bullets: ["Roteiro INSS e BPC/LOAS", "Tratamento de objeções", "Auditoria de aderência"],
    image: "/mockups/04-campanha-regras.png",
  },
  {
    icon: Repeat,
    title: "Cadência & Renitência Inteligente",
    badge: "Não Queima Base",
    description:
      "Cada disposição possui sua própria regra de re-discagem com intervalo específico, teto diário de tentativas e melhor horário do dia para rechamar.",
    bullets: ["8 disposições configuráveis", "Horário inteligente de rechamada", "Prioridade na fila do dia"],
    image: "/mockups/04b-campanha-cadencia.png",
  },
  {
    icon: ShieldCheck,
    title: "Conformidade LGPD & Não Perturbe",
    badge: "Segurança Jurídica",
    description:
      "Lista de bloqueio integrada com prazo automático, filtro contra Não Perturbe e Procon, registro de consentimento e auditoria append-only de acessos.",
    bullets: ["Bloqueio automático com prazo", "Registro de Encarregado LGPD", "Auditoria de gestão completa"],
    image: "/mockups/06-empresa-cadastro.png",
  },
];

export default function FeaturesGrid({ onOpenDemoModal }: FeaturesGridProps) {
  return (
    <section id="funcionalidades" className="py-20 md:py-28 bg-navy-950 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Title */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-royal/20 border border-brand-blue/30 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
            <span>Diferenciais Exclusivos</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Tudo o Que Seu Correspondente Precisa para{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Vender Mais Consignado
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Criado especificamente para a realidade de promotoras de crédito e call centers de consignado.
            Sem funções genéricas de CRM que ninguém usa.
          </p>
        </div>

        {/* Features 3x2 Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-navy-900/80 rounded-2xl border border-navy-700/80 overflow-hidden shadow-xl hover:border-brand-blue/60 transition-all duration-300 flex flex-col justify-between group"
              >
                {/* Visual Preview Header */}
                <div className="relative aspect-[16/9] w-full bg-navy-950 overflow-hidden border-b border-navy-800">
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="absolute top-3 right-3">
                    <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-navy-950/90 text-amber-400 border border-amber-500/30 backdrop-blur-sm">
                      {feature.badge}
                    </span>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-6 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="w-10 h-10 rounded-xl bg-navy-850 flex items-center justify-center text-amber-400 border border-navy-700 mb-4 group-hover:bg-amber-400 group-hover:text-navy-950 transition-colors">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-amber-400 transition-colors">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed mb-4">
                      {feature.description}
                    </p>
                  </div>

                  <div>
                    <ul className="space-y-1.5 border-t border-navy-800 pt-4 mb-5">
                      {feature.bullets.map((bullet, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>

                    <button
                      onClick={onOpenDemoModal}
                      className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 transition-colors group-hover:underline"
                    >
                      <span>Ver demonstração deste recurso</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
