# LB Assist Chess

Plataforma SaaS de análise e treinamento de xadrez. O usuário conecta sua conta do Chess.com ou Lichess (ou importa PGNs), a plataforma analisa o histórico com Stockfish, identifica padrões de erro e transforma o diagnóstico em um plano de treinamento personalizado.

## Estado atual — Fase 4 (Treinamento Inteligente e Evolução)

### O que funciona
- **Diagnóstico personalizado de fraquezas**: análise consolidada dos resultados de partidas analisadas, categorização por fase e magnitude do erro, confiança do diagnóstico (alta/média/baixa), tendência recente, exemplos de posições reais, recomendações práticas. Estados honestos de amostra insuficiente.
- **Sistema de exercícios personalizados**: exercícios gerados a partir de posições reais das partidas do usuário (posição anterior ao erro), tabuleiro interativo com clique para mover, feedback de correto/incorreto, explicação com variação principal, registro de tentativas, referência à partida de origem.
- **Plano de treinamento semanal**: distribuição de exercícios em 7 dias baseada nas prioridades do diagnóstico, sessões de revisão, marcação de sessões concluídas, plano provisório quando não há diagnóstico.
- **Página de evolução**: filtros por período (30d/90d/1ano/tudo), métricas reais (partidas analisadas, taxa de erro, taxa de erros graves, acurácia em exercícios), comparação entre períodos, consistência de treino, avisos de amostra pequena.
- **Identidade visual**: paleta de cores premium (roxo elétrico + ciano sobre fundo escuro), tipografia Inter, componentes reutilizáveis, animações suaves e suporte a movimento reduzido.
- **Landing page comercial**: header com navegação, hero, seção "Seu jogo tem padrões", 4 etapas "Do erro à evolução", grade de funcionalidades, preços carregados do banco (não hardcodeados), FAQ acordeão e footer.
- **Autenticação completa**: cadastro, login, recuperação de senha e logout via Supabase Auth. Validação de formulários, mensagens de erro em português, estados de carregamento.
- **Onboarding**: 5 etapas (rating, plataforma, controle de tempo, minutos por dia, objetivo). Salvamento real no banco. Perguntas podem ser puladas e alteradas depois.
- **Banco de dados**: tabelas `profiles`, `training_preferences`, `external_accounts`, `games`, `game_analyses`, `app_config` com RLS owner-scoped, triggers de criação automática de perfil e índices.
- **Layout responsivo**: sidebar no desktop, menu compacto no celular, rotas protegidas.
- **Dashboard conectado a dados reais**: saudação, treino do dia, indicadores de habilidade (sem notas inventadas), ponto de atenção, evolução recente e atalhos. Mostra estado vazio com instrução quando não há partidas importadas.
- **Páginas legais**: política de privacidade e termos de uso.
- **Importação de PGN**: upload por arrastar e soltar ou seleção de arquivo, validação de formato e tamanho, parse de múltiplas partidas por arquivo, extração de metadados (jogadores, resultado, data, controle de tempo, abertura), deduplicação por hash SHA-256 e por external_id.
- **Lista de partidas**: filtros por origem, cor e resultado, busca por jogador ou abertura, estados de carregamento/erro/vazio, remoção com confirmação.
- **Visualizador de tabuleiro**: tabuleiro em SVG com navegação por lances (início, anterior, próximo, fim), lista de lances clicável, exibição de metadados.
- **Análise com Stockfish 19 (WASM)**: execução local no navegador via Web Worker, sem servidor. Avaliação real de cada posição (centipeões/mate), melhor lance, profundidade, classificação de lances (melhor, excelente, bom, imprecisão, erro, erro grave), barra de avaliação, resumo com contagem e acurácia por lado.
- **Controle de análise**: profundidade configurável (5-20), cancelar e retomar, salvamento incremental no Supabase a cada 5 posições, estado visual (aguardando, em andamento, concluída, cancelada, falhou).
- **Deduplicação de análise**: índice UNIQUE impede análises duplicadas ativas para a mesma partida; análises concluídas não são reexecutadas automaticamente.
- **Aviso de licença GPLv3**: exibido na página de detalhe da partida com link para o texto completo da licença e repositórios do código-fonte.
- **Banco de dados (Fase 4)**: tabelas `diagnoses`, `exercises`, `exercise_attempts`, `training_plans`, `plan_sessions` com RLS owner-scoped, índices em `user_id`, constraints UNIQUE para deduplicação de exercícios.

### O que foi testado
- Build de produção (`npm run build`) — sem erros nem warnings.
- Typecheck (`npm run typecheck`) — sem erros.
- Migrações aplicadas via Supabase MCP (0001-0005).
- Verificação da estrutura: worker bundlado como chunk separado (`stockfishWorker-*.js`), WASM e licença copiados para `public/`.
- Rotas de Treinar, Evolução e Diagnóstico conectadas às páginas reais.

### Limitações conhecidas
- **Sem servidor de análise**: a análise roda inteiramente no navegador do usuário. O desempenho depende do hardware do dispositivo. Partidas muito longas (80+ lances) na profundidade máxima podem levar vários minutos.
- **Acurácia aproximada**: a fórmula de acurácia é uma aproximação simplificada, não a fórmula exata do Lichess. É honesta (baseada em perda real de avaliação) mas não comparável diretamente.
- **Single-threaded**: usa o build lite single-threaded do Stockfish 19 para compatibilidade máxima. Multi-threaded seria mais rápido mas requer SharedArrayBuffer (headers COOP/COEP).
- **Sem variantes principais múltiplas**: MultiPV está implementado no worker mas a interface atual mostra apenas a linha principal (MultiPV=1).
- **Retomada não é incremental**: ao retomar uma análise cancelada, a análise recomeça do início. O salvamento parcial é para persistência, não para retomada exata do ponto de parada.
- **Validação de exercícios limitada**: sem MultiPV, apenas o melhor lance do Stockfish é aceito como correto. Alternativas equivalentes não podem ser validadas — isso é comunicado transparentemente na interface.
- **Diagnóstico é indicativo, não definitivo**: a categorização de erros usa fase da partida e magnitude da queda de avaliação como evidência. Uma queda não prova a causa humana do erro. As categorias são atribuições, não análise cognitiva.
- **Rating não é oficial**: qualquer rating estimado pela plataforma não é comparável ao rating oficial de Chess.com ou Lichess.

### O que depende de configuração externa
- **Integração Chess.com / Lichess** (Fase 2 restante): a tabela `games` e o modal de importação PGN estão prontos. A importação por API dos provedores ainda não foi implementada.
- **Pagamentos / Asaas** (Fase 5): não implementado. O preço é configurado no banco (`app_config`) mas a integração de cobrança ainda não existe.

### O que falta implementar
- **Fase 2 restante**: Integração por API com Chess.com e Lichess (importação automática por nome de usuário).
- **Fase 5**: Assinaturas, pagamentos, administração, testes de segurança.

## Arquitetura

```
Frontend (React + TypeScript + Vite + Tailwind)
├── src/
│   ├── components/      # Componentes reutilizáveis (Button, Modal, Toast, States, AppShell, Logo, Chessboard, ImportModal)
│   ├── context/         # AuthContext (sessão Supabase + perfil)
│   ├── hooks/           # useAppConfig, useGameAnalysis, useDiagnosis, useTrainingPlan
│   ├── lib/             # Cliente Supabase singleton, parser PGN (chess.js), engine de análise, diagnosis, exercises
│   ├── pages/           # LandingPage, AuthPages, OnboardingPage, DashboardPage, GamesListPage, GameDetailPage, DiagnosticoPage, TreinarPage, EvolucaoPage, LegalPages, PlaceholderPage
│   ├── workers/         # stockfishWorker.ts (Web Worker UCI para Stockfish WASM)
│   └── App.tsx          # Roteamento (react-router-dom) + rotas protegidas
│
Backend (Supabase)
├── auth.users           # Autenticação (Supabase Auth)
├── profiles             # Perfil do usuário (trigger cria automaticamente no cadastro)
├── training_preferences # Preferências do onboarding
├── external_accounts    # Conexões Chess.com / Lichess
├── games                # Partidas importadas (deduplicação por external_id e pgn_hash)
├── game_analyses       # Resultados de análise Stockfish (deduplicação por game_id ativo)
├── diagnoses            # Diagnósticos consolidados de fraquezas (versionados)
├── exercises            # Exercícios gerados de posições reais (deduplicação por user+game+ply)
├── exercise_attempts    # Tentativas e resultados dos exercícios
├── training_plans       # Planos de treinamento semanal
├── plan_sessions        # Sessões diárias do plano de treino
└── app_config           # Configurações administrativas (planos, limites) — leitura pública

Engine de análise (no navegador do usuário)
└── Stockfish 19 (WASM lite single-threaded) via Web Worker — GPL v3
```

### Decisões de segurança
- **RLS em todas as tabelas**: cada usuário acessa apenas seus próprios dados. As queries de partidas e análises filtram por `user_id` e a RLS impede acesso entre usuários.
- **Trigger `handle_new_user`**: cria o perfil automaticamente após o cadastro, sem depender do frontend.
- **`app_config` leitura pública**: apenas configurações marcadas `is_public = true` são legíveis pelo anon; escrita só via `service_role`.
- **Rotas protegidas**: `/app` e `/onboarding` exigem sessão autenticada.
- **Sem dados fictícios**: o dashboard mostra "sem dados" quando não há partidas, em vez de inventar análises.
- **Deduplicação dupla**: por `external_id` (Chess.com/Lichess) e por `pgn_hash` SHA-256 (upload PGN), garantida por índices UNIQUE no banco.
- **Deduplicação de análise**: índice UNIQUE em `(game_id)` WHERE status ativo impede análises duplicadas; análises concluídas não são reexecutadas.
- **Validação de arquivo PGN**: limite de tamanho (configurável no banco), validação de extensão, parse com chess.js que rejeita PGNs inválidos.
- **Análise local**: o Stockfish roda no navegador do usuário via Web Worker, sem enviar dados para servidores externos. Nenhuma chave secreta é exposta.
- **Confirmação destrutiva**: remoção de partida exige confirmação no modal.

## Variáveis de ambiente

Já configuradas no ambiente Bolt (não requerem ação manual):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Variáveis de servidor (para fases futuras):
- `SUPABASE_SERVICE_ROLE_KEY` — para o serviço de análise e webhooks.
- `ASAAS_API_KEY` — para pagamentos (Fase 5).

## Comandos

```bash
npm run dev        # Servidor de desenvolvimento (executado automaticamente)
npm run build      # Build de produção
npm run typecheck  # Verificação de tipos
npm run lint       # ESLint
```

## Licença do Stockfish

O Stockfish é software livre distribuído sob a licença GPLv3. Os créditos e obrigações de distribuição estão disponíveis em https://stockfishchess.org/. O LB Assist Chess não é afiliado ao Stockfish, Chess.com ou Lichess.

### Detalhes da integração

- **Pacote**: `stockfish` v19.0.1 no npm (por Nathan Rugg / Chess.com)
- **Versão do engine**: Stockfish 19 (build lite single-threaded, WASM)
- **Licença**: GPL v3 — texto completo em `public/stockfish-license.txt` e em `/stockfish-license.txt` no app
- **Código-fonte**:
  - Engine: https://github.com/official-stockfish/Stockfish
  - Build WASM: https://github.com/nmrugg/stockfish.js
- **Rede neural**: nn-61e7af4bb97d por Chris Bao (sscg13)

### Como a análise funciona

1. O usuário abre uma partida importada e clica em "Analisar partida".
2. O app cria um Web Worker que carrega o Stockfish 19 compilado em WASM (1.8 MB).
3. O app reproduz a sequência de lances com chess.js, gerando o FEN de cada posição.
4. Para cada posição, o Stockfish avalia via protocolo UCI (`position fen ... go depth N`).
5. A avaliação (centipeões ou mate) é sempre da perspectiva das brancas e convertida para a perspectiva do jogador ao classificar o lance.
6. A perda de avaliação classifica o lance: melhor (<0.5 peões), imprecisão (0.5-1.0), erro (1.0-3.0), erro grave (>3.0). Posições de mate são tratadas separadamente.
7. Os resultados são salvos incrementalmente no Supabase (tabela `game_analyses`) a cada 5 posições.
8. A interface permanece responsiva porque o engine roda em um thread separado (Web Worker).
9. O usuário pode cancelar a qualquer momento; a análise parcial é salva como "cancelada".

### Limites configuráveis

- **Profundidade**: 5 (rápido) a 20 (profundo), padrão 15
- **Tempo por posição**: 1000ms (configurável no código)
- **MultiPV**: 1 (linha principal apenas; suporte a múltiplas linhas implementado no worker mas não exibido na interface)
