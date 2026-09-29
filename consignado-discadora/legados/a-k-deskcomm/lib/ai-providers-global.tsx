import React from "react";

export function AIProviders(){
  const providers = [
    ["Vercel AI Gateway","Roteamento unificado de modelos e observabilidade","Configuração externa"],
    ["OpenAI","Modelos OpenAI via variável de ambiente","API paga conforme uso"],
    ["Anthropic","Modelos Claude via variável de ambiente","API paga conforme uso"],
    ["Google Gemini","Modelos Gemini via variável de ambiente","Pode ter cota gratuita, conforme a conta e os limites vigentes"],
  ] as const;
  return React.createElement("div", {className:"aiProvidersScreen"},
    React.createElement("div", {className:"title"}, React.createElement("div", null,
      React.createElement("h1", null, "Provedores de IA"),
      React.createElement("p", null, "Conectores de modelos usados pelos agentes")
    )),
    React.createElement("div", {className:"card"},
      React.createElement("div", {className:"notice"}, "Nenhuma chave de API é exibida nesta tela. O CRM usa variáveis de ambiente no servidor e nunca grava segredo no navegador."),
      ...providers.map(([name, detail, cost]) => React.createElement("div", {className:"row", key:name},
        React.createElement("div", null, React.createElement("b", null, name), React.createElement("small", null, detail)),
        React.createElement("span", {className:"pill"}, cost)
      ))
    )
  );
}

if (typeof globalThis !== "undefined") {
  (globalThis as typeof globalThis & { AIProviders?: typeof AIProviders }).AIProviders = AIProviders;
}
