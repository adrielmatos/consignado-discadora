"use client";

import { useState } from "react";
import { siteConfig } from "@/config/site";
import { ChevronDown, HelpCircle, MessageCircle } from "lucide-react";

interface FaqAccordionProps {
  onOpenDemoModal: () => void;
}

export default function FaqAccordion({ onOpenDemoModal }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggleQuestion = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 md:py-28 bg-navy-900/60 relative border-t border-navy-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-royal/20 border border-brand-blue/30 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Tire Suas Dúvidas</span>
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Perguntas Frequentes de{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-yellow-300">
              Correspondentes Bancários
            </span>
          </h2>
          <p className="mt-4 text-base sm:text-lg text-slate-300">
            Respostas diretas e honestas para as principais dúvidas sobre tecnologia, implantação e operação.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-4">
          {siteConfig.faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div
                key={index}
                className="bg-navy-950/90 rounded-xl border border-navy-800 overflow-hidden transition-all duration-200 hover:border-navy-700"
              >
                <button
                  onClick={() => toggleQuestion(index)}
                  className="w-full text-left p-5 sm:p-6 flex items-center justify-between gap-4 font-bold text-white hover:text-amber-400 transition-colors"
                >
                  <span className="text-base sm:text-lg">{faq.question}</span>
                  <div
                    className={`w-7 h-7 rounded-full bg-navy-850 flex items-center justify-center shrink-0 border border-navy-700 transition-transform duration-200 ${
                      isOpen ? "rotate-180 text-amber-400 border-amber-500/40" : "text-slate-400"
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-5 sm:px-6 pb-6 text-sm sm:text-base text-slate-300 leading-relaxed border-t border-navy-850 pt-4">
                    {faq.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Still have questions CTA */}
        <div className="mt-12 text-center bg-navy-850/60 rounded-xl p-6 border border-navy-700/60">
          <h3 className="text-base font-bold text-white mb-2">
            Ainda ficou com alguma dúvida sobre sua operação?
          </h3>
          <p className="text-xs sm:text-sm text-slate-400 mb-4">
            Nosso time técnico e comercial está online no WhatsApp para tirar qualquer dúvida em tempo real.
          </p>
          <button
            onClick={onOpenDemoModal}
            className="btn-cta-vibrant px-6 py-3 rounded-lg text-xs font-black inline-flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4 text-navy-950 fill-navy-950" />
            <span>Falar Agora no WhatsApp</span>
          </button>
        </div>
      </div>
    </section>
  );
}
