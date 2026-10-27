export const siteConfig = {
  name: "Discadora Consignado Pro",
  tagline: "CRM & Discador pelo Celular para Crédito Consignado",
  description:
    "A única discadora desenvolvida especificamente para correspondentes de crédito consignado. Zero custo de telefonia VoIP (disque direto pelo chip do celular via PC), esteira Meu INSS, simulador de margem e esteira de anuência blindada.",
  url: "https://discadora-callcenter.vercel.app",
  systemLoginUrl: "https://discadora-callcenter.vercel.app/login",
  whatsappNumber: "5511999999999", // Configurável: número comercial de atendimento
  whatsappDefaultMessage:
    "Olá! Gostaria de agendar uma demonstração gratuita e conhecer os planos da Discadora Consignado Pro.",
  
  metrics: [
    { label: "Custo por Minuto Falado", value: "R$ 0,00", desc: "Usa o plano ilimitado do seu chip" },
    { label: "Ligações Realizadas", value: "+500k", desc: "Em operações de crédito ativo" },
    { label: "Economia Média em VoIP", value: "85%", desc: "Comparado a discadores em nuvem" },
    { label: "Aderência a Metas", value: "3.2x", desc: "Mais propostas com anuência paga" },
  ],

  plans: [
    {
      id: "iniciante",
      name: "Iniciante / Individual",
      subtitle: "Para operadores autônomos ou início de operação",
      price: "97",
      period: "/mês",
      highlight: false,
      badge: "Comece Hoje",
      features: [
        "1 Operador ativo simultâneo",
        "Discagem ilimitada via celular (Phone Link)",
        "Zero custo de minutos VoIP ou tarifas",
        "CRM com Ficha do Lead 360º",
        "Simulador básico de margem INSS",
        "Importador de planilhas de leads",
        "Suporte por e-mail e comunidade",
      ],
      ctaText: "Começar Individual",
      ctaType: "whatsapp",
    },
    {
      id: "pro",
      name: "Equipe Pro",
      subtitle: "O plano mais escolhido por Correspondentes Bancários",
      price: "247",
      period: "/mês",
      highlight: true,
      badge: "Mais Vendido • Melhor Custo-Benefício",
      features: [
        "Até 5 Operadores simultâneos",
        "Discagem ilimitada em todos os postos",
        "Esteira completa de Anuência Meu INSS",
        "Simulador de Margem avançado (recusa propostas acima do teto)",
        "Roteiro interativo com tratamento de objeções",
        "Cadência e Renitência inteligente por disposição",
        "Relatórios de metas em tempo real ('Faltam N')",
        "Auditoria de gestão e conformidade LGPD",
        "Suporte prioritário via WhatsApp",
      ],
      ctaText: "Garantir Vaga na Equipe Pro",
      ctaType: "whatsapp",
    },
    {
      id: "enterprise",
      name: "Call Center Enterprise",
      subtitle: "Para médias e grandes operações de crédito",
      price: "497",
      period: "/mês",
      highlight: false,
      badge: "Alta Escala",
      features: [
        "Operadores ilimitados (consulte expansão)",
        "Múltiplas campanhas simultâneas (INSS, BPC, FGTS, SIAPE)",
        "Distribuição de carteira por rodízio ou operador",
        "Scorecard de QA para supervisores",
        "Webhook de entrada de leads em tempo real",
        "Trilha de auditoria append-only para compliance",
        "Gerente de conta dedicado e onboarding guiado",
      ],
      ctaText: "Falar com Especialista",
      ctaType: "whatsapp",
    },
  ],

  faqs: [
    {
      question: "Como funciona a discagem sem pagar tarifas de VoIP?",
      answer:
        "O sistema utiliza o aplicativo nativo 'Vincular ao Windows' (Phone Link) conectado ao celular do operador (Android ou iPhone) via Bluetooth/Wi-Fi. O operador clica no painel do PC ou deixa o agente automático rodar, e a chamada é disparada pelo chip da sua operadora celular com plano ilimitado. Você nunca mais paga pacotes caros de minutos VoIP.",
    },
    {
      question: "Qualquer computador com Windows é compatível?",
      answer:
        "Sim! O software requer Windows 10 ou 11 com o aplicativo Vincular ao Windows (já vem pré-instalado em todas as versões modernas). O pareamento leva apenas 2 minutos.",
    },
    {
      question: "Como o sistema ajuda no fechamento da anuência do Meu INSS?",
      answer:
        "Diferente de CRM genéricos, a Discadora Consignado Pro possui uma esteira dedicada com contagem regressiva de dias restantes para expiração da anuência no Meu INSS. O operador e o supervisor recebem alertas imediatos para acionar o cliente antes do cancelamento do contrato.",
    },
    {
      question: "O sistema possui controle e proteção contra multas da LGPD?",
      answer:
        "Sim. Possui lista negra integrada de bloqueios com prazo (Não Perturbe, Procon, fraudes e óbitos), registro de consentimento por lead e auditoria append-only de todas as alterações feitas pela gestão.",
    },
    {
      question: "Posso importar minhas próprias listas e planilhas de leads?",
      answer:
        "Com certeza! O importador de leads é tolerante a variações de cabeçalhos de planilhas Excel/CSV, detecta colunas automaticamente, preserva campos extras e faz a validação dos números telefônicos.",
    },
    {
      question: "Já tenho uma equipe usando outros sistemas. O treinamento é demorado?",
      answer:
        "Não! A interface do operador foi desenhada para ser simples, limpa e intuitiva: botão de 'Próximo Lead', cronômetro de chamada, ficha do cliente e botões rápidos de tabulação. Em menos de 15 minutos qualquer atendente já está discando.",
    },
  ],
};
