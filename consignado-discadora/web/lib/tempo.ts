/**
 * Fuso da operação: o dia de trabalho é o de Brasília, e as views do banco já
 * truncam `now() at time zone 'America/Sao_Paulo'`.
 *
 * Isso não é preciosismo de CSS: componente de tela formata data no servidor
 * (SSR) e de novo no navegador. Sem fuso explícito, o servidor da Vercel (UTC)
 * escreve uma hora e o navegador do operador escreve outra — React reclama de
 * hydration e, pior, o operador vê o prazo da anuência com hora errada. Todo
 * `toLocale*` de data neste app passa por aqui.
 */
export const BR_TZ = "America/Sao_Paulo";

export const OPC_DATA_HORA = { timeZone: BR_TZ, dateStyle: "short", timeStyle: "short" } as const;
export const OPC_DATA = { timeZone: BR_TZ, dateStyle: "medium" } as const;
