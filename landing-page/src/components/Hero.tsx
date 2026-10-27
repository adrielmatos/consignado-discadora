import { useState } from "react";
import { 
  PhoneCall, 
  Sparkles, 
  ArrowRight, 
  Calculator, 
  CheckCircle2, 
  Smartphone, 
  ShieldCheck, 
  Zap,
  TrendingUp,
  Clock
} from "lucide-react";

interface HeroProps {
  onOpenDemoModal: () => void;
}

const previewTabs = [
  {
    id: "painel",
    name: "Painel do Dono",
    badge: "Visão 360º",
    tagline: "KPIs ao vivo, fila em tempo real e gargalos do dia sem abrir planilha.",
    image: "/mockups/01-dona-painel.png",
    highlights: ["Fila em tempo real", "Ranking dos operadores", "Controle de pendências"],
  },
  {
    id: "esteira",
    name: "Esteira Meu INSS",
    badge: "Anti-Cancelamento",
    tagline: "Acompanhe cada proposta e saiba exatamente quantos dias faltam para a anuência expirar.",
    image: "/mockups/02-crm-esteira.png",
    highlights: ["Contagem regressiva de anuência", "Kanban por status", "Tarefas e retornos"],
  },
  {
    id: "operador",
    name: "Tela do Operador",
    badge: "Alta Produtividade",
    tagline: "Botão 'Próximo Lead', discagem em 1 clique pelo celular e histórico completo do cliente.",
    image: "/mockups/11-operador-lead.png",
    highlights: ["Zero cliques perdidos", "Dados do benefício", "Cronômetro de ligação"],
  },
  {
    id: "simulador",
    name: "Simulador de Margem",
    badge: "Zero Recusa",
    tagline: "Calcula a parcela máxima sobre a margem real do INSS durante a chamada.",
    image: "/mockups/12b-operador-simulador.png",
    highlights: ["Cálculo automático", "Bloqueia propostas inválidas", "Gera proposta pronta"],
  },
  {
    id: "relatorios",
    name: "Metas & Auditoria",
    badge: "Gestão Ativa",
    tagline: "Meta do dia com indicador 'Faltam N' e trilha completa de auditoria LGPD.",
    image: "/mockups/05-relatorios-metas.png",
    highlights: ["Meta 'Faltam N ligações'", "Aderência ao roteiro", "Horários de maior contato"],
  },
];

export default function Hero({ onOpenDemoModal }: HeroProps) {
  const [activeTab, setActiveTab] = useState(previewTabs[0].id);
  const currentTab = previewTabs.find((t) => t.id === activeTab) || previewTabs[0];

  return (
    <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-grid-pattern">
      {/* Background Lighting Elements */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-brand-royal/20 blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[300px] bg-amber-500/10 blur-[120px] pointer-events-none rounded-full" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Top Announcement Badge */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-navy-850/90 border border-amber-500/30 shadow-lg shadow-amber-500/10 hover:border-amber-400/50 transition-all cursor-pointer"
            onClick={onOpenDemoModal}
          >
            <span className="flex h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-bold text-amber-300 uppercase tracking-wider">
              Tecnologia Phone Link
            </span>
            <span className="text-xs text-slate-400">|</span>
            <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
              Zero Custo com Minutos VoIP <ArrowRight className="w-3 h-3 text-amber-400" />
            </span>
          </div>
        </div>

        {/* Main Headline */}
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.12]">
            A Única Discadora para Consignado com{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-yellow-300 to-orange-400">
              Zero Custo VoIP
            </span>{" "}
            e Foco Total em Fechar a{" "}
            <span className="underline decoration-brand-blue decoration-wavy decoration-2">
              Anuência Meu INSS
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg lg:text-xl text-slate-300 max-w-3xl mx-auto font-normal leading-relaxed">
            Pare de queimar dinheiro com pacotes caros de minutos VoIP e bloqueios de operadora. 
            Disque pelo chip ilimitado do celular dos operadores via PC, qualifique o cliente com 
            simulador de margem integrado e nunca mais perca contratos por prazo de anuência expirado.
          </p>

          {/* Action CTAs (Mix Mateus energetic impact) */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={onOpenDemoModal}
              className="btn-cta-vibrant w-full sm:w-auto px-8 py-4 rounded-xl text-sm sm:text-base flex items-center justify-center gap-3 shadow-2xl group"
            >
              <Zap className="w-5 h-5 text-navy-950 fill-navy-950 group-hover:scale-110 transition-transform" />
              <span>TESTAR GRÁTIS NA MINHA OPERAÇÃO</span>
              <ArrowRight className="w-4 h-4 text-navy-950 group-hover:translate-x-1 transition-transform" />
            </button>

            <a
              href="#calculadora"
              className="w-full sm:w-auto px-6 py-4 rounded-xl text-sm sm:text-base font-bold text-slate-200 bg-navy-850 hover:bg-navy-800 border border-navy-700 hover:border-brand-blue/50 flex items-center justify-center gap-2.5 transition-all shadow-md hover:shadow-brand-blue/20"
            >
              <Calculator className="w-4 h-4 text-amber-400" />
              <span>Calcular Economia com VoIP</span>
            </a>
          </div>

          {/* Trust bullet badges */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-slate-300">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Sem contrato de fidelidade</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Disca pelo chip Android ou iPhone</span>
            </div>
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Instalação e início em 15 minutos</span>
            </div>
          </div>
        </div>

        {/* Realistic Interactive Mockup Viewer with Real System Screenshots */}
        <div className="mt-14 max-w-6xl mx-auto">
          {/* Navigation Tabs for System Screens */}
          <div className="flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-3 no-scrollbar">
            {previewTabs.map((tab) => {
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 border ${
                    active
                      ? "bg-brand-royal text-white border-brand-blue shadow-lg shadow-brand-blue/40"
                      : "bg-navy-900/80 text-slate-400 border-navy-800 hover:text-white hover:bg-navy-850"
                  }`}
                >
                  <span>{tab.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold ${
                      active
                        ? "bg-amber-400 text-navy-950"
                        : "bg-navy-800 text-slate-300"
                    }`}
                  >
                    {tab.badge}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Browser / App Showcase Chrome */}
          <div className="mt-4 rounded-2xl bg-navy-900 border border-navy-700/80 shadow-2xl shadow-navy-950/90 overflow-hidden">
            {/* Window Topbar */}
            <div className="bg-navy-950 px-4 py-3 border-b border-navy-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                <span className="ml-2 text-xs text-slate-400 font-mono hidden sm:inline">
                  discadora-callcenter.vercel.app/{currentTab.id}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Sistema em Produção
                </span>
              </div>
            </div>

            {/* Screen Screenshot Container */}
            <div className="relative aspect-[16/9] w-full bg-navy-950 group overflow-hidden flex items-center justify-center">
              <img
                src={currentTab.image}
                alt={currentTab.name}
                className="w-full h-full object-contain object-top group-hover:scale-[1.01] transition-transform duration-500"
                loading="eager"
              />

              {/* Bottom Info Bar Overlay */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-navy-950 via-navy-950/90 to-transparent p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-navy-800/60">
                <div>
                  <h2 className="text-white font-bold text-sm sm:text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    <span>{currentTab.name}:</span>
                    <span className="text-slate-300 font-normal">{currentTab.tagline}</span>
                  </h2>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {currentTab.highlights.map((h, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-medium bg-navy-850/90 text-blue-200 border border-brand-blue/30 px-2.5 py-0.5 rounded-full"
                      >
                        ✓ {h}
                      </span>
                    ))}
                  </div>
                </div>

                <button
                  onClick={onOpenDemoModal}
                  className="btn-cta-vibrant shrink-0 px-4 py-2 rounded-lg text-xs font-black flex items-center justify-center gap-2"
                >
                  <span>VER ESTA TELA AO VIVO</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
