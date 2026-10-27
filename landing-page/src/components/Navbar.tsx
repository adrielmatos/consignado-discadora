import { useState, useEffect } from "react";
import { siteConfig } from "@/config/site";
import { PhoneCall, MessageCircle, LogIn, Menu, X, ShieldCheck } from "lucide-react";

interface NavbarProps {
  onOpenDemoModal: () => void;
}

export default function Navbar({ onOpenDemoModal }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-navy-950/90 backdrop-blur-md border-b border-navy-700/60 shadow-xl shadow-navy-950/50 py-3"
          : "bg-navy-950/60 backdrop-blur-sm border-b border-white/5 py-4"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="#" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-royal via-brand-blue to-cyan-400 p-[2px] shadow-lg shadow-brand-blue/30 group-hover:shadow-brand-blue/50 transition-all">
              <div className="w-full h-full bg-navy-950 rounded-[10px] flex items-center justify-center">
                <PhoneCall className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg sm:text-xl text-white tracking-tight">
                  Discadora <span className="text-amber-400">Consignado</span>
                </span>
                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-royal text-blue-200 border border-brand-blue/40 tracking-wider">
                  PRO
                </span>
              </div>
              <p className="text-[11px] text-slate-400 -mt-0.5 hidden sm:block">
                Zero VoIP • CRM & Esteira INSS
              </p>
            </div>
          </a>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a
              href="#funcionalidades"
              className="hover:text-amber-400 transition-colors"
            >
              Funcionalidades
            </a>
            <a
              href="#calculadora"
              className="hover:text-amber-400 transition-colors flex items-center gap-1"
            >
              <span>Economia VoIP</span>
              <span className="text-[10px] font-bold bg-amber-500/20 text-amber-400 px-1.5 py-0.2 rounded border border-amber-500/30">
                85% OFF
              </span>
            </a>
            <a
              href="#esteira-inss"
              className="hover:text-amber-400 transition-colors"
            >
              Esteira Meu INSS
            </a>
            <a
              href="#comparativo"
              className="hover:text-amber-400 transition-colors"
            >
              Comparativo
            </a>
            <a
              href="#planos"
              className="hover:text-amber-400 transition-colors"
            >
              Planos
            </a>
            <a
              href="#faq"
              className="hover:text-amber-400 transition-colors"
            >
              Dúvidas
            </a>
          </nav>

          {/* Action Buttons: Acessar Sistema (Oficial) + WhatsApp CTA */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Botão Oficial de Login do Sistema */}
            <a
              href={siteConfig.systemLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-200 hover:text-white bg-navy-850/80 hover:bg-navy-800 border border-navy-700/80 hover:border-brand-blue/50 transition-all shadow-sm"
              title="Acessar o Painel Operacional da Discadora"
            >
              <LogIn className="w-4 h-4 text-cyan-400" />
              <span>Acessar Sistema</span>
            </a>

            {/* CTA Vibrante (Mix Mateus style) */}
            <button
              onClick={onOpenDemoModal}
              className="btn-cta-vibrant flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-extrabold"
            >
              <MessageCircle className="w-4 h-4 text-navy-950 fill-navy-950" />
              <span>Falar no WhatsApp</span>
            </button>
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 md:hidden">
            <a
              href={siteConfig.systemLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg bg-navy-850 text-cyan-400 border border-navy-700"
              title="Acessar Sistema"
            >
              <LogIn className="w-5 h-5" />
            </a>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-navy-850 text-slate-300 hover:text-white border border-navy-700"
              aria-label="Abrir Menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-navy-950/98 border-b border-navy-800 px-4 pt-3 pb-6 space-y-3">
          <nav className="flex flex-col space-y-2 text-base font-medium text-slate-200">
            <a
              href="#funcionalidades"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400"
            >
              Funcionalidades
            </a>
            <a
              href="#calculadora"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400 flex items-center justify-between"
            >
              <span>Calculadora de Economia</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded font-bold">
                85% OFF
              </span>
            </a>
            <a
              href="#esteira-inss"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400"
            >
              Esteira Meu INSS
            </a>
            <a
              href="#comparativo"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400"
            >
              Comparativo VoIP
            </a>
            <a
              href="#planos"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400"
            >
              Tabela de Planos
            </a>
            <a
              href="#faq"
              onClick={() => setMobileMenuOpen(false)}
              className="px-3 py-2 rounded-md hover:bg-navy-850 hover:text-amber-400"
            >
              Perguntas Frequentes
            </a>
          </nav>

          <div className="pt-2 border-t border-navy-800 space-y-2">
            <a
              href={siteConfig.systemLoginUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-navy-850 border border-navy-700"
            >
              <LogIn className="w-4 h-4 text-cyan-400" />
              <span>Acessar Painel do Sistema</span>
            </a>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenDemoModal();
              }}
              className="btn-cta-vibrant w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-extrabold"
            >
              <MessageCircle className="w-4 h-4 text-navy-950 fill-navy-950" />
              <span>Agendar Demonstração no WhatsApp</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
