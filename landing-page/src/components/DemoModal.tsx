"use client";

import { useState } from "react";
import { siteConfig } from "@/config/site";
import { X, MessageCircle, Send, ShieldCheck, Zap } from "lucide-react";

interface DemoModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultMessage?: string;
}

export default function DemoModal({
  isOpen,
  onClose,
  defaultMessage,
}: DemoModalProps) {
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [operadores, setOperadores] = useState("1 a 5 operadores");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const customText = defaultMessage
      ? defaultMessage
      : `Olá! Me chamo ${nome || "um Correspondente"}. Tenho uma equipe com ${operadores}. Gostaria de conhecer e agendar uma demonstração da Discadora Consignado Pro!`;

    const cleanNumber = siteConfig.whatsappNumber.replace(/\D/g, "");
    const encodedText = encodeURIComponent(customText);
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedText}`;

    window.open(whatsappUrl, "_blank");
    onClose();
  };

  const handleDirectWhatsApp = () => {
    const cleanNumber = siteConfig.whatsappNumber.replace(/\D/g, "");
    const encodedText = encodeURIComponent(
      defaultMessage || siteConfig.whatsappDefaultMessage
    );
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedText}`;
    window.open(whatsappUrl, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg bg-navy-900 border-2 border-amber-500/50 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-amber-500/10 overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-navy-800 transition-colors"
          aria-label="Fechar Modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Zap className="w-3 h-3" />
            <span>Demonstração Gratuita</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">
            Fale com um Especialista em Consignado
          </h3>
          <p className="text-xs sm:text-sm text-slate-300 mt-1">
            Preencha os campos abaixo para ser atendido imediatamente ou clique no botão direto para o WhatsApp.
          </p>
        </div>

        {/* Lead Capture Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Seu Nome / Nome do Correspondente
            </label>
            <input
              type="text"
              required
              placeholder="Ex: Carlos Silva - Promotora Cred"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Seu WhatsApp Comercial
            </label>
            <input
              type="tel"
              required
              placeholder="(DDD) 99999-9999"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
              Tamanho Atual da Sua Equipe
            </label>
            <select
              value={operadores}
              onChange={(e) => setOperadores(e.target.value)}
              className="w-full bg-navy-950 border border-navy-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-400 transition-colors"
            >
              <option value="1 operador (apenas eu)">1 operador (apenas eu)</option>
              <option value="2 a 5 operadores">2 a 5 operadores (Equipe Pro)</option>
              <option value="6 a 15 operadores">6 a 15 operadores</option>
              <option value="Mais de 15 operadores">Mais de 15 operadores (Enterprise)</option>
            </select>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            className="btn-cta-vibrant w-full py-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 mt-4"
          >
            <Send className="w-4 h-4 text-navy-950 fill-navy-950" />
            <span>ENVIAR E ABRIR NO WHATSAPP</span>
          </button>
        </form>

        {/* Divider / Direct alternative */}
        <div className="mt-4 pt-4 border-t border-navy-800 text-center">
          <button
            type="button"
            onClick={handleDirectWhatsApp}
            className="text-xs text-slate-400 hover:text-amber-400 font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
            <span>Prefere ir direto para o WhatsApp sem preencher formulário? Clique aqui</span>
          </button>
        </div>
      </div>
    </div>
  );
}
