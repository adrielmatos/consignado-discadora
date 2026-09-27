# Fontes verificadas (27/09/2026)

Tudo abaixo foi conferido **hoje**: repositórios um a um na API do GitHub (`stars`, `license`,
`pushed_at`) e páginas por busca na web. Não é lista decorada de memória.

## 1. Automatizar o Phone Link ("Vincular ao Windows") — é aqui que mora o seu caso

| Repo | ★ | Licença | Push | O que entrega |
|---|---|---|---|---|
| `pywinauto/pywinauto` | 6.183 | BSD-3 | 2026-05-23 | Biblioteca usada pelo agente: Windows GUI Automation (UIA). É o que faz "clicar no botão Liguar do Phone Link". |
| `beuaaa/pywinauto_recorder` | 199 | — | 2026-01-10 | Grava/reproduz ações de GUI — útil para descobrir os seletores do Phone Link na sua versão. |
| `vofr/DiscordBotPhoneLinkDialer` | 5 | — | 2025-02-05 | **Prova de conceito do seu caso**: bot que, ao receber comando, abre o Phone Link no Windows, digita número e disca pelo celular (tem vídeo). Autor explica que fez isso porque "o iOS restringe ações de discagem automatizada". |
| `KibeStevie/Phone-Call-Automation` | 0 | GPL-3.0 | 2025-11-24 | Mesmo objetivo, comparando duas abordagens: coordenadas fixas de tela (`pyautogui`) vs. captura de tela. No README: *"interacts with Microsoft Phone Link via UI automation — **not** through any official API"*. |
| `tcdoverlord/Windows-Bluetooth-PhoneLink-Doctor` | 1 | — | 2026-07-17 | Toolkit PowerShell para diagnosticar/repair de Bluetooth + Phone Link no Windows. Cola de operação para o dia que o vínculo quebrar. |
| `sourman/android-auto-pickup` | 0 | — | 2026-03-05 | Atende automaticamente chamadas de números específicos no Android — "useful for Windows Phone Link". |
| `Hello-Mr-Crab/pywechat` | 1.962 | — | 2026-09-26 | Referência de engenharia: RPA de desktop grande e mantido (PC WeChat), mostra o padrão de robustez necessário em automação de UI. |

**Nada disso é uma API oficial.** Buscas por `phone link api`, `microsoft your phone api` e
`ms-phone` não retornaram cliente oficial — o próprio Phone Link é um app de consumidor.

## 2. Requisitos oficiais do Phone Link (páginas da Microsoft, consultadas hoje)

- **iPhone**: `Link to Windows` (App Store, id6443686328) — recursos no PC: *"fazer e receber
  chamadas"*, notificações, SMS, contatos, arquivos. Requer **iOS 16.6+** e **PC com Bluetooth LE**,
  Windows 10 (Mai/2019+) ou 11. Não funciona em iPad/Mac.
- **Android**: Play Store `com.microsoft.appmanager` — *"make and receive calls from your PC"* com
  asterisco: **chamadas exigem PC Windows 10 com capacidade Bluetooth**. Recursos avançados (Phone
  screen, arrastar-e-soltar, apps) exigem Samsung/HONOR/etc. compatíveis.
- support.microsoft.com (página de requisitos, 25/08/2026): celular e PC na **mesma rede Wi-Fi**
  para a melhor experiência; Android de várias marcas suportados; iPhone precisa de iOS 16+.
- **Consequência direta para o projeto**: o iPhone **consegue** discar/atender pelo PC (ótimo), mas
  o histórico de chamadas continua **inacessível** por app (ver seção 3). O CDR, no seu desenho, vem
  do **seu agente** (ele sabe quando discou e quando terminou), não do celular.

## 3. Por que o CDR no iPhone não vem do aparelho

- Fórum de desenvolvedores da Apple (thread 764958, iOS 18): *"Não. Não há nenhuma API no sistema
  que dê acesso ao histórico de chamadas do usuário."* E: apps que mostram isso *"integram com
  serviços VoIP ou da operadora, obtendo os dados dessa fonte externa, não por API do iOS"*.
- Ask Different (236573): `tel:` aberto por app em foreground disca sem perguntar; aberto de página
  web, o iOS mostra o alerta de confirmação. Nada disso roda em background.
- Apple Support (guia Atalhos): URL scheme oficial
  `shortcuts://run-shortcut?name=[nome]&input=text&text=[texto]` — é a ponte CRM → iPhone que o
  painel usa (link "Shortcut").

## 4. CRMs gratuitos/abertos que rodam no eixo GitHub + Supabase + Vercel

| Repo / projeto | ★ | Licença | Push | Cabe no seu stack? |
|---|---|---|---|---|
| `melgarafael/DeskcommCRM` | 4.057 | **MIT** | **2026-09-27** | **Sim, e é o mais próximo de "pronto".** Next.js 16 + Supabase (Postgres/Auth/Realtime/Storage, RLS por tenant) + WhatsApp (WAHA/NOWEB) + **Asterisk via ARI** (`asterisk/ari.conf.example`, `pjsip.conf.example`, `.env.voip.example`, `Dockerfile.voice-agent`). Autor brasileiro, README em PT-BR, alternativa aberta a Kommo/Octadesk/Intercom. **Porém**: pensado para self-host com Docker (VPS 4 GB); *não* é a Vercel que hospeda o app. |
| `ArnasDev/wacrm` | 2.423 | (verificar) | 2026-09-21 | CRM template self-hosted para WhatsApp: inbox compartilhado, contatos, pipeline, broadcast. |
| SuiteCRM (+ `serfreeman1337/asterlink`, 42★ MIT, push 2025-04-03) | — | AGPL / MIT | — | CRM completo gratuito + conector Asterisk↔CRM com click2dial e registro de chamada. Requer servidor com PHP, não Vercel. |
| EspoCRM + extensão oficial VoIP | — | AGPL-3.0 (core) | — | A integração telefônica é a mais pronta do mundo open source (Asterisk/AMI, Twilio, 3CX, Starface, Binotel, iexPBX), **mas a extensão é comercial (~US$388/instância)** e o repo de exemplo `tmachyshyn/ext-voip-provider` avisa: *"commercially licensed product; derivative works must not be relicensed"*. |
| Odoo Community + `OCA/connector-telephony` | — | AGPLv3 | ativo | Click-to-dial que **faz o telefone do usuário tocar primeiro e só depois disca o lead** — é literalmente o seu fluxo com Phone Link. Pesado (ERP inteiro). |
| `michellzappa/core-oss` (2★) / `leongrphc/leadfinder` (0★) | — | — | 2026 | "CRM minimalista em Next.js + Supabase + Tailwind" — não são produtos, mas são **exatamente o formato** que cabe na Vercel. Usei como referência de forma no app deste repositório. |

## 5. O que NÃO existe no GitHub (procurei, não achei)

- **Nenhum sistema de consignado maduro.** As buscas retornaram só projetos pequenos/pessoais:
  `Thiago789/margem-clara` (0★, MVP de gestão de margem consignável), `pedrohsus/NeoConsig` (0★,
  consulta de margem), `fabianoaljava/rederconsignado` (C#, 2023), `iordan21/cse-calculadora-emprestimo`
  (Kotlin, simululação/portabilidade/margem), `EduardoDosSantosFerreira/star_consignados` (Vue, 9★).
  → Ou seja: a lógica de negócio do consignado (margem, anuência, portabilidade, prazos) você vai
  escrever. O schema deste projeto já nasce com esse esqueleto (`propostas.anuencia`, prazo de 5 dias).
- **Nenhuma integração Phone Link↔Supabase/Vercel** — por isso o `agent/` aqui existe.

## 6. Regras do jogo em consignado (o que muda o produto, não só o jurídico)

- **Lei nº 15.327/2026** (Senado Notícias, 07/01/2026): benefícios do INSS passam a ser
  **bloqueados automaticamente** para novas operações de consignado; exige **autorização prévia,
  pessoal e específica** do beneficiário para **cada** contratação; desbloqueio por **biometria ou
  assinatura eletrônica qualificada**; **proibida a contratação por procuração ou por telefone**;
  devolução integral em caso de desconto indevido em até 30 dias.
- Vigência prática em **19/05/2026** (gov.br/INSS, Valor, EBC): proposta cai no Meu INSS como
  "pendente de confirmação"; o beneficiário tem **5 dias corridos** para validar; sem validação,
  **cancelamento automático**. Prazo sobe de 96 para **até 108 parcelas**, carência de até 3 meses.
  Margem: **40%** para benefícios previdenciários, **35%** para assistenciais (BPC/LOAS).
- **IN INSS nº 213, de 24/08/2026** (Mix Vale): biometria facial deixou de ser o único caminho —
  autorização pode ser via Meu INSS com validação de dados bancários — mas continua
  **explícita e pelo app**: *"não são mais aceitas autorizações feitas por telefone ou apenas por
  gravação de voz"*. Portabilidade exige termo específico no app; bancos têm **20 dias** para
  confirmar portabilidade e **7 dias úteis** para informar o depósito ao INSS.
- Vedações de venda: proibido embutir **seguro prestamista** na contratação (Meu Tudo, 22/01/2026);
  tutela/curatela só com autorização judicial.
- Telefonia: desde ago/2025 o prefixo **0303 é facultativo**, mas quem passa de **500 mil
  chamadas/mês** precisa **autenticar** (Origem Verificada / STIR-SHAKEN), e operadoras cortam
  tráfego por chamada derrubada em ~3s, CID oculto e **discagem sem atendente proporcional**
  (Folha/InfoMoney ago/2025; Correio Braziliense ago/2026).

**Tradução para o produto:** o telefone serve para *qualificar e cobrar a anuência*, nunca para
contratar. O funil real é `contato → proposta enviada → anuência no Meu INSS em 5 dias →
depósito`. Por isso `v_anuencia_pendente` existe e a tela do operador tem botão de proposta —
é aí que seu dinheiro aparece, não na discagem.
