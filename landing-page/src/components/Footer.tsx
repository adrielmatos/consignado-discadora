import { siteConfig } from "@/config/site";
import { PhoneCall, LogIn, ShieldCheck, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-navy-950 border-t border-navy-800 text-slate-400 text-xs py-12 md:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Col 1: Brand & Tagline */}
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-brand-royal flex items-center justify-center text-amber-400">
                <PhoneCall className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-lg text-white tracking-tight">
                Discadora <span className="text-amber-400">Consignado</span> PRO
              </span>
            </div>
            <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-md">
              A plataforma definitiva de CRM e discagem pelo celular para correspondentes bancários, promotoras de crédito e call centers de consignado (INSS, BPC, FGTS e SIAPE).
            </p>
            <div className="flex items-center gap-2 text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Conformidade com Anatel e LGPD (Lei 13.709/2018).</span>
            </div>
          </div>

          {/* Col 2: Navigation */}
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider text-xs mb-4">
              Navegação
            </h4>
            <ul className="space-y-2.5">
              <li>
                <a href="#funcionalidades" className="hover:text-amber-400 transition-colors">
                  Funcionalidades
                </a>
              </li>
              <li>
                <a href="#calculadora" className="hover:text-amber-400 transition-colors">
                  Calculadora VoIP
                </a>
              </li>
              <li>
                <a href="#comparativo" className="hover:text-amber-400 transition-colors">
                  Comparativo de Mercado
                </a>
              </li>
              <li>
                <a href="#planos" className="hover:text-amber-400 transition-colors">
                  Tabela de Preços
                </a>
              </li>
              <li>
                <a href="#faq" className="hover:text-amber-400 transition-colors">
                  Perguntas Frequentes
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Sistema & Acesso Oficial */}
          <div>
            <h4 className="font-bold text-white uppercase tracking-wider text-xs mb-4">
              Acesso ao Sistema
            </h4>
            <p className="text-xs text-slate-400 mb-3">
              Já é cliente ou operador cadastrado? Acesse seu painel de discagem:
            </p>
            <a
              href={siteConfig.systemLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-navy-850 hover:bg-navy-800 text-white border border-navy-700 hover:border-brand-blue text-xs font-semibold transition-all"
            >
              <LogIn className="w-4 h-4 text-cyan-400" />
              <span>Acessar Painel Oficial</span>
            </a>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-navy-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-slate-400 text-[11px]">
          <div>
            © {new Date().getFullYear()} Discadora Consignado Pro. Todos os direitos reservados.
          </div>
          <div>
            Desenvolvido exclusivamente para Correspondentes Bancários e Promotoras de Crédito.
          </div>
        </div>
      </div>
    </footer>
  );
}
