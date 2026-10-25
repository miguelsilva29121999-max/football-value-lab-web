# Football Value Lab Web 5.3 — Mercados para cotar + Chat Gemini

**O que muda:** o ecrã do Assistente IA mostra agora até 3 mercados calculados numericamente antes de qualquer resposta do Gemini. A IA deixa de interpretar a ausência de odd como razão para dizer apenas «esperar». Quando existem dados suficientes, escolhe uma hipótese principal PARA COTAR e explica-a. Só depois de introduzires uma odd é que avalia o preço. Se não há dados suficientes, não inventa uma seleção.

**Nota:** probabilidades e odds mínimas são experimentais, sem validação preditiva. A procura de um mercado não significa indicação de aposta nem garantia de lucro. O site não tem feed desportivo live.

**Atualizar o site que já está na Vercel:** no repositório privado GitHub associado à Vercel, carrega a estrutura deste ZIP na RAIZ (pastas api, lib, public, tests, vercel.json, server.mjs e package.json) substituindo os ficheiros existentes. O Vercel publicará a atualização quando o GitHub guardar o commit. As variáveis GEMINI_API_KEY, GEMINI_MODEL e SITE_ACCESS_CODE permanecem na Vercel, não precisam de ser alteradas. Não envies essas chaves para o repositório.

# Football Value Lab Web 5.3 — Preparado para Vercel

Este projeto transforma o Football Value Lab 5.1 (Gemini) numa aplicação web, com páginas estáticas em `public/` e endpoints Node.js no diretório `api/`. Não requer executar ficheiros `.bat`, instalar Node.js no computador da empresa nem publicar a chave de IA.

**Estado:** código preparado e testado localmente. Não está publicado na Vercel até que cries/ligues o projeto na tua conta.

## Publicar sem instalar nada, pelo browser

1. Entra em [GitHub](https://github.com/new), cria um **repositório privado novo** chamado `football-value-lab-web`. Não uses um repositório de outros projetos.
2. Descarrega o ZIP e **extrai a pasta**. No GitHub, abre o repositório → **Add file → Upload files**. Arrasta **todos os ficheiros e subpastas que estão dentro de** `Football_Value_Lab_WEB_5_2` (pastas `api`, `lib`, `public`, `tests` e ficheiros `.mjs`, `.json`, etc.), não apenas o ZIP. Confirma que o `vercel.json` e o `package.json` ficam na raiz do repositório.
3. Em [Vercel](https://vercel.com/new), seleciona **Add New → Project**, importa o repositório novo e escolhe **Framework Preset: Other**. A pasta raiz é a do repositório.
4. Em **Environment Variables**, adiciona:
   - `GEMINI_API_KEY` = a tua chave do Google AI Studio (não a partilhes por chat e não a coloques no GitHub).
   - `SITE_ACCESS_CODE` = código de acesso longo, difícil de adivinhar (**12 ou mais caracteres**), que vais escrever no browser ao entrar no site.
   - `GEMINI_MODEL` = o identificador de modelo que já confirmaste a funcionar no Google AI Studio (mantém o valor já configurado na Vercel).
   - `ODDS_API_KEY` só se quiseres reativar o radar antigo de odds (opcional).
5. Escolhe **Deploy**. Abre o endereço `https://...vercel.app/ai`. Na primeira visita, quando o site consultar a API, escreve o código de acesso que definiste.
6. Escolhe um jogo → **Analisar jogo com IA**. Se encontrares um erro, consulta **Vercel → Project → Logs**.

## Segurança e custo

- `GEMINI_API_KEY` e `SITE_ACCESS_CODE` são lidos **só no servidor** através das variáveis de ambiente. Nunca os coloques num ficheiro público, comentário, print ou chat.
- O código de acesso é pedido no browser para chamadas à API, guardado **apenas na sessão do separador** e transmitido à função por HTTPS. As páginas HTML estáticas podem ser acessíveis sem senha, mas as chamadas às APIs ficam protegidas. Isto é uma barreira simples para um **site privado de utilização pessoal**, não é um sistema de autenticação empresarial.
- **Atenção:** o site não tem limitação distribuída por utilizador, captcha nem base de dados de sessões. Usa um código longo; se pensares partilhar o site com muita gente, precisaremos de autenticação robusta e quotas por utilizador.
- A Vercel Hobby oferece plano gratuito para projetos pessoais não comerciais dentro de limites. Se os excederes, algumas funcionalidades poderão ficar indisponíveis até à reposição da quota. A política pode mudar.
- O Gemini dispõe de planos gratuitos limitados conforme o modelo e a conta, sujeito à quota do projeto Google. **Não atives faturação** se pretendes manter os custos da IA a zero. O Gemini pode limitar pedidos/pesquisa web. Os dados enviados no plano gratuito podem ser usados para melhorar produtos Google.
- O site depende de fontes de resultados/estatísticas externas, cuja cobertura e condições podem variar. Não dispõe de feed live e não fornece aposta garantidamente lucrativa.
- `.env` está excluído do Git e **não é necessário no deploy Vercel**. Os ficheiros `.bat` foram removidos do pacote web.

## Estrutura

- `public/`: interface do site (homepage `/` e assistente `/ai`).
- `api/`: 12 endpoints Vercel (funções Node.js).
- `lib/`: fornecedores, motor estatístico e integração Gemini.
- `server.mjs`: lógica partilhada das rotas e servidor local opcional.
- `vercel.json`: mapeamento `/ai` e duração das funções.
- `tests/`: testes automáticos locais.

## Testes executados

`npm test` cobre o motor herdado e a proteção cloud. Foram usados dados simulados: **não validámos uma consulta real ao Google Gemini, nem um deployment Vercel com a tua conta.**

## Documentação

- [Vercel: importar um repositório Git](https://vercel.com/docs/git)
- [Vercel: funções Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Google AI Studio: chaves](https://aistudio.google.com/api-keys)
- [Gemini API: preços e quota gratuita](https://ai.google.dev/gemini-api/docs/pricing)
