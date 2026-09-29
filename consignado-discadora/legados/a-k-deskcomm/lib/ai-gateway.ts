import { generateText } from "ai";

export const AI_MODELS = [
  { id: "openai/gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "OpenAI", cost: "baixo", description: "Modelo rápido para atendimento, classificação e tarefas de alto volume." },
  { id: "openai/gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "OpenAI", cost: "médio", description: "Equilíbrio para tarefas comerciais e análise." },
  { id: "openai/gpt-5.6-sol", name: "GPT-5.6 Sol", provider: "OpenAI", cost: "alto", description: "Modelo para tarefas mais complexas e agentes." },
  { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic", cost: "pago", description: "Alternativa de provedor para failover e comparação." },
  { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "Google", cost: "pago", description: "Alternativa rápida para tarefas de atendimento." },
] as const;

export function modelAllowed(model: string) {
  return AI_MODELS.some((item) => item.id === model);
}

export async function runDeskcommAI({
  model,
  prompt,
  system,
  userId,
}: {
  model: string;
  prompt: string;
  system?: string;
  userId: string;
}) {
  if (!modelAllowed(model)) throw new Error("Modelo de IA não permitido.");
  const result = await generateText({
    model,
    system: system || "Você é o assistente de IA da A&K Deskcomm. Responda em português do Brasil, seja objetivo, profissional e não invente dados de clientes.",
    prompt,
    maxOutputTokens: 700,
    providerOptions: {
      gateway: {
        user: userId,
        tags: ["app:ak-deskcomm", "feature:crm-ai"],
      },
    },
  });
  return {
    text: result.text,
    usage: result.usage,
    model,
  };
}
