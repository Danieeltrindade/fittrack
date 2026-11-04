# FitTrack

Site pessoal para acompanhar **treinos**, **dieta**, **hidratação** e **peso**.
É um site **estático** (HTML + CSS + JavaScript puros, scripts clássicos, sem React e sem etapa de build), pensado para ser publicado no **GitHub Pages**. Tem dois modos:

| Modo | Para quê | Onde ficam os dados | Fala com servidor? |
|---|---|---|---|
| **Demonstração** | Qualquer pessoa experimenta sem cadastro | Dados **fictícios** em `localStorage["fittrack_demo_v1"]` | **Nunca** |
| **Conta pessoal** | Seus dados, em qualquer aparelho | Banco PostgreSQL do **Supabase** (fonte da verdade), protegido por login + RLS | Sim (só com login) |

A tela inicial pública oferece as duas opções: **Experimentar demonstração** e **Criar conta ou entrar**.

---

## 1. Onde cada dado fica

| Dado | Modo pessoal | Demonstração |
|---|---|---|
| Perfil, metas, tema/cor, treinos, histórico, alimentos, refeições, peso, água | **Supabase** (tabelas com RLS) | `fittrack_demo_v1` (fictício) |
| Sessão de login (token) | `localStorage["fittrack_auth"]`, gerenciado pelo supabase-js oficial | — |
| Preferência visual (tema/cor) para a tela inicial antes do login | `localStorage["fittrack_prefs"]` (não é dado pessoal) | idem |
| **Dados antigos** do FitTrack local | `localStorage["fittrack_data"]` — **somente leitura**, nunca apagado nem alterado pelo app; usado só como origem de uma migração **explícita** | não usado |
| Cópia de segurança antes de migrar | `localStorage["fittrack_data_pre_cloud_<hash>"]` | — |

Regra de propriedade: em cada modo existe **um único** mecanismo de persistência. No modo pessoal o `localStorage` **não** guarda dados pessoais (só preferências, a sessão e a cópia de segurança da migração). Não há cache offline: **o modo pessoal precisa de conexão** (veja “Limitações”).

---

## 2. Estrutura do projeto

```
fittrack/
├── index.html                 página, scripts e ordem de carregamento
├── css/                       themes, main, layout, components, auth (tela inicial/login/faixas), responsive
├── js/
│   ├── config.js              URL + chave PÚBLICA do Supabase (vazio = só demonstração)
│   ├── config.example.js      modelo com valores FICTÍCIOS
│   ├── utils.js  data.js  migrate.js            helpers, constantes/demo, migração de formato (v1→v2)
│   ├── services/
│   │   ├── supabase.js        ÚNICO ponto que cria o cliente Supabase (+ trava contra chave secreta)
│   │   ├── auth.js            cadastro, login, logout, recuperação, mensagens de erro
│   │   ├── changes.js         diff documento→alterações (só o que mudou vai ao banco)
│   │   ├── dataRepository.js  DemoRepo (local) e CloudRepo (RPCs do Supabase); erros classificados
│   │   └── legacy.js          detecção e migração dos dados antigos (explícita, conferida)
│   ├── store.js               documento em memória + escrita confirmada e enfileirada
│   ├── state.js  events.js  backup.js  boot.js  app.js
│   ├── actions/               regras de dados (diet, workout, hydration, profile) — async
│   ├── views/                 landing (login etc.), account, dashboard, workouts, diet, progress, hydration, settings
│   └── components/            icons, modal, charts, datePicker, navigation, ui
├── supabase/migrations/       SQL versionado: 1 tabelas · 2 RLS · 3 funções · 4 metas por objetivo, refeições salvas e fotos
├── scripts/check-secrets.js   procura segredos no projeto antes de publicar
├── tests/                     testes SQL (RLS) e e2e (navegador) — não fazem parte do site publicado
└── .gitignore
```

**Camadas:** telas/ações **nunca** chamam Supabase nem SQL. Fluxo: `view → Action → Store.update(fn) → Changes.diff → CloudRepo.commit → RPC apply_changeset`. A tela só muda **depois** que o servidor confirma; se falhar (rede, permissão, valor inválido, sessão vencida), o estado anterior permanece e o erro é mostrado — nunca aparece “salvo” sem confirmação. Escritas são enfileiradas (uma por vez) e cliques repetidos durante uma gravação são ignorados.

---

## 3. Banco de dados (Supabase / PostgreSQL)

Migrações em `supabase/migrations/` (rode **nesta ordem**):

1. `20261009000001_schema.sql` — tabelas, restrições, índices, gatilho que cria o perfil após o cadastro.
2. `20261009000002_rls.sql` — RLS em todas as tabelas, políticas e permissões.
3. `20261009000003_functions.sql` — funções RPC (`get_my_data`, `apply_changeset`, `import_backup`, `mark_legacy_import`, `delete_all_my_data`).
4. `20261102000004_goals_saved_meals_photos.sql` — **aditiva e idempotente** (pode rodar mais de uma vez; não apaga nem altera dados existentes): colunas de objetivo/peso desejado/déficit/metas por objetivo em `profiles`, tabelas `saved_meals` e `saved_meal_items` (com RLS), colunas de foto em `foods`, `meals`, `meal_items`, e o bucket **privado** `food-photos` (1 MB, JPEG) com políticas por pasta `<seu user_id>/`. Rode no *SQL Editor* **depois** das migrações 1–3. O bucket é criado pela própria migração; confira em *Storage* que `food-photos` existe e está marcado como privado. Se você já usa o app, **nada se perde**: as migrações 1–3 não mudam.

**Tabelas:** `profiles`, `workouts`, `workout_exercises`, `workout_sessions`, `session_exercises`, `session_sets`, `foods`, `meals`, `meal_items`, `weight_history`, `hydration`, `legacy_imports`.

**Relações e integridade**
- Toda tabela pessoal tem `user_id` (→ `auth.users`, `ON DELETE CASCADE`) com `DEFAULT auth.uid()` e chave primária `(user_id, id)`. **O cliente nunca informa o dono.**
- Chaves estrangeiras **compostas** `(user_id, pai_id)`: uma linha só pode apontar para entidades **do mesmo usuário** (ex.: sessão → treino, item de refeição → refeição/alimento). Ligar algo à entidade de outra conta é recusado pelo banco.
- `ON DELETE SET NULL (coluna)` preserva histórico: apagar um treino não apaga as sessões; apagar um alimento da biblioteca não altera refeições.
- `meal_items` guarda **cópias** dos valores nutricionais: editar a biblioteca não muda refeições antigas.
- Restrições (`CHECK`): peso/macros/água não negativos, tipos de refeição válidos, dias 0–6 etc.
- Um gatilho (`handle_new_user`) cria o perfil (peso, metas de calorias/proteína/gordura/**carboidrato único**/água, tema, cor) logo após o cadastro.

**RLS (políticas)**: em **todas** as tabelas, políticas explícitas para `SELECT`, `INSERT` (`WITH CHECK`), `UPDATE` (`USING` + `WITH CHECK`) e `DELETE`, todas `TO authenticated` e baseadas em `user_id = (select auth.uid())`. Um gatilho extra torna `user_id` imutável. O papel `anon` (visitantes e a demonstração) **não tem nenhuma permissão** em tabelas nem funções. O RLS **nunca** é desativado e não há política permissiva.

**Funções RPC** são `SECURITY INVOKER` (rodam como o usuário, com RLS), com `search_path` vazio, e cada chamada é **uma transação** (tudo ou nada):
- `get_my_data()` — todos os dados da conta no formato do app.
- `apply_changeset(p)` — grava só as linhas alteradas (agregados com filhos). Referências a entidades inexistentes/alheias viram “sem vínculo” (`NULL`).
- `import_backup(p, modo)` — importação **atômica**: `replace` (troca todos os dados da conta) ou `merge` (acrescenta). IDs do arquivo são recodificados de forma determinística por conta (`md5(user|tipo|id)`), então repetir **não duplica**; `user_id` do arquivo é ignorado.
- `mark_legacy_import(hash, resumo)` — registra a migração como concluída (chamada só depois da conferência).
- `delete_all_my_data()` — apaga **só** os dados da própria conta (mantém o login).

---

## 4. Configurar o Supabase (passo a passo, no painel)

> Nada disto foi feito por mim: o projeto Supabase é seu. Eu não tenho acesso a ele e **nunca** preciso das suas senhas ou chaves secretas — não as envie por chat.

1. **Criar o projeto** em <https://supabase.com> → *New project*. Guarde a senha do banco num gerenciador de senhas (ela **não** vai em nenhum arquivo do site).
2. **Rodar as migrações:** *SQL Editor* → *New query* → cole e execute, **em ordem**, os 3 arquivos de `supabase/migrations/`. (Alternativa: Supabase CLI `supabase db push`.) Confira em *Table Editor* que as tabelas existem e que cada uma mostra o cadeado “RLS enabled”.
3. **Autenticação** (*Authentication → Providers → Email*):
   - Email habilitado; **Confirm email: ligado** (também evita revelar se um e-mail já está cadastrado).
   - *Authentication → Sign In / Providers → Password*: tamanho mínimo **8**.
   - Cadastro aberto (não há convite nem administrador).
4. **URLs** (*Authentication → URL Configuration*):
   - **Site URL:** a URL final do site (ex.: `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`).
   - **Redirect URLs** (lista de permissão — usadas na confirmação de cadastro e na recuperação de senha): adicione
     - `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/**`
     - `http://localhost:8080/**` (desenvolvimento local; ajuste a porta)
     - o domínio próprio, se usar um (`https://seudominio.com/**`).
   - Os e-mails usam os modelos padrão (*Authentication → Email Templates*: “Confirm signup” e “Reset password”, que contêm `{{ .ConfirmationURL }}`). Se editar os modelos, mantenha esse link.
5. **E-mail em produção:** o envio padrão do Supabase tem limite baixo e é só para testes. Para uso real configure um SMTP próprio (*Project Settings → Authentication → SMTP*).
6. **Copiar a configuração pública** (*Project Settings → API*): **Project URL** e a chave **publishable** (ou `anon`). Cole em `js/config.js`:
   ```js
   window.FITTRACK_CONFIG = {
     supabaseUrl: 'https://xxxxxxxx.supabase.co',
     supabaseKey: 'sb_publishable_...'
   };
   ```
   Esses dois valores **são públicos por projeto** (a segurança vem do RLS) e podem ser versionados — o site publicado precisa deles. **Jamais** cole aqui a `service_role`, a chave `sb_secret_…`, a senha do banco ou tokens: o app **recusa** iniciar com chave secreta (e `node scripts/check-secrets.js` também a detecta).
7. **Verificar o RLS:** em *Authentication → Policies* confira 4 políticas por tabela; em *Database → Advisors* (Security) não deve haver alerta de tabela sem RLS.

### Sem servidor, sem variáveis de ambiente
GitHub Pages só serve arquivos estáticos: não existe variável de ambiente no servidor. Toda a configuração é o `js/config.js` público acima. Qualquer segredo no repositório estaria exposto a todos — por isso nunca vão para lá.

---

## 5. Rodar localmente

- **Demonstração** funciona até abrindo `index.html` direto do disco.
- **Contas** exigem HTTP(S) (redirecionamentos de e-mail e criptografia do login): `python3 -m http.server 8080` na pasta do projeto e abra `http://localhost:8080`. Lembre de ter `http://localhost:8080/**` nas *Redirect URLs*.
- Sem `js/config.js` preenchido, o botão “Criar conta ou entrar” fica desativado com a explicação e só a demonstração funciona.

### Biblioteca supabase-js
`index.html` carrega **`@supabase/supabase-js@2.45.4`** (versão **fixa**, build UMD que expõe `window.supabase`) pela CDN jsDelivr, como script clássico (sem módulos ES — não misturamos os dois modelos). Para não depender de CDN e poder fixar a integridade:
```bash
mkdir -p js/vendor && curl -L -o js/vendor/supabase.js https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js
openssl dgst -sha384 -binary js/vendor/supabase.js | openssl base64 -A    # hash SRI, se quiser usar integrity=""
```
e troque o `src` do `<script>` em `index.html` por `js/vendor/supabase.js`. Se a biblioteca não carregar, o site avisa e a demonstração continua funcionando.

---

## 6. Publicar no GitHub Pages

1. `node scripts/check-secrets.js` → deve dizer “nenhum segredo encontrado”.
2. Envie a pasta para um repositório (a pasta `tests/` e `supabase/` podem ir junto; não afetam o site).
3. *Settings → Pages* → *Deploy from a branch* → branch principal, pasta `/ (root)`. Não há build.
4. Descubra a URL que o GitHub mostrar (não presuma) e coloque-a em **Site URL** e **Redirect URLs** no Supabase (passo 4 acima).
5. **Testes pós-publicação** (manuais, no site publicado): demonstração abre sem cadastro · criar conta → chega o e-mail → confirmar → entrar · salvar um dado, recarregar e ver que ficou · sair e entrar de novo · “Esqueci minha senha” → link → nova senha · migrar dados antigos (se houver) · criar uma **segunda conta** de teste e conferir que ela **não** vê os dados da primeira.

---

## 7. Migração dos dados antigos (`fittrack_data`)

Nunca é automática. Ao entrar numa conta, se o navegador tiver dados antigos válidos, aparece uma faixa (e um botão em *Configurações*): **Ver e migrar**. O fluxo:

1. **Resumo** do que existe (treinos, sessões, refeições…) e do que vai acontecer.
2. **Cópia de segurança** do JSON original em `fittrack_data_pre_cloud_<hash>` (conferida byte a byte; se falhar, nada é enviado). Há também “Baixar cópia (.json)”.
3. **Confirmação explícita** (“Migrar para minha conta”).
4. **Envio atômico** (`import_backup`, modo `merge`): tudo ou nada; IDs determinísticos → repetir não duplica.
5. **Conferência**: o banco devolve quantas linhas do arquivo existem; todas as contagens precisam bater.
6. Só então a migração é **marcada como concluída** (`legacy_imports`) e a tela recarrega os dados da conta.

Preserva: perfil/metas/aparência (aplicados só se o perfil da conta ainda estiver em branco), treinos e exercícios, histórico com cargas/repetições, biblioteca, refeições com macros, peso e água. A meta de carboidratos em faixa (mín–máx) de versões antigas vira a meta única (usa o mínimo).
Em falha: aparece a etapa que falhou, nada é marcado como concluído, o original continua intacto e dá para tentar de novo. O app **nunca apaga** `fittrack_data`; se quiser, você mesmo o remove depois de conferir sua conta.

## 8. Exportar / importar backup (.json)

- **Exportar** gera um arquivo só com os **seus dados** (sem senha, token, chave, e-mail ou ID de conta).
- **Importar** vale só **para a conta logada**: o arquivo é **validado por completo antes de tocar no banco**; arquivos com campos de identidade/credencial (`user_id`, `email`, `token`, `password`…) são **recusados**; mostra o resumo e **pede confirmação**; a troca é feita por uma função transacional (tudo ou nada) e conferida. Backups antigos (formato v1) também são aceitos.
- A demonstração não tem exportar/importar: ela tem o próprio **“Restaurar dados fictícios”**.

---

## 9. Segurança — resumo

- Só a chave **pública** existe no site. A senha do banco, `service_role` e `sb_secret_…` nunca entram no código, README, Git ou navegador.
- Isolamento garantido **no banco** (RLS + chaves compostas + `user_id` por `auth.uid()`), não por esconder botões.
- Login/senha/recuperação/sessão são do **Supabase Auth** oficial (PKCE, renovação automática de token). Mensagens não revelam se um e-mail está cadastrado.
- A demonstração usa só dados fictícios locais, sem chamadas ao servidor e sem credenciais compartilhadas.
- Ao sair (ou ao trocar de conta), `DB`, estado de tela e DOM são zerados: nada da sessão anterior permanece.

---

## 10. Testes

Em `tests/` (precisam de Postgres 16, `psql`, Node 18+ e Playwright/Chromium; não vão para o site):

```bash
cd tests
./run-pg.sh fittrack_test && PGHOST=127.0.0.1 PGPORT=54329 PGUSER=postgres \
  psql -q -t -A -d fittrack_test -f sql/10_rls_tests.sql     # RLS e funções, duas contas, num Postgres real
psql -q -t -A -d fittrack_test -f sql/11_new_features.sql      # tabelas novas, Storage e isolamento (após o 10)
./run-upgrade.sh                                              # migração 4 sobre um banco já com dados
./run-e2e.sh                                                  # navegador (Chromium) + servidor de teste ligado ao Postgres
node ../scripts/check-secrets.js                              # varredura de segredos
```

- **SQL:** migrações aplicadas num Postgres 16 real com papéis `anon`/`authenticated` e `auth.uid()`; verifica isolamento entre duas contas, bloqueio de `anon`, inserção/alteração com `user_id` alheio, ligação a entidades de outra conta, restrições, atomicidade e idempotência da importação, cascatas.
- **E2E:** cadastro/confirmação/login/logout/recuperação, persistência, perfil, treinos, sessões, biblioteca, macros proporcionais, refeições, peso, água, dashboard, progresso, tema/cor, exportar/importar, migração do armazenamento antigo (incluindo falha e repetição), demonstração e seu isolamento, duas contas, ataques via API, erros de rede/permissão, sessão expirada, abas desatualizadas e responsividade (390/820/1280 px).
- **Limite importante:** nesses testes o supabase-js é **substituído** por um stub (`tests/e2e/supabase-stub.js`) e o Auth/PostgREST pelo servidor de teste. O banco, as migrações, o RLS e as funções **são reais**; o **cliente supabase-js verdadeiro e o Supabase hospedado não foram exercitados** — por isso o teste manual pós-publicação (seção 6) é obrigatório.

---

## 11. Limitações conhecidas

- **Sem modo offline:** no modo pessoal, sem internet nada é gravado (o app avisa e mantém os dados da conta). Não há fila nem conflito de sincronização porque não há cache local de dados pessoais.
- **Vários aparelhos/abas:** não há tempo real. Gravar numa tela desatualizada **não apaga** o que outra gravou (só linhas alteradas são enviadas), mas na mesma linha vale “a última gravação vence”. Use “Atualizar dados”/recarregue para ver mudanças de outro aparelho.
- **Não incluído no app:** trocar e-mail/senha logado (use “Esqueci minha senha”) e excluir a conta (faça no painel do Supabase; os dados somem em cascata).
- **Recuperação de senha (PKCE):** abra o link no **mesmo navegador** em que pediu a recuperação.
- **E-mails** dependem do SMTP configurado no Supabase (limite baixo no padrão).
- Contas exigem HTTPS/localhost; a demonstração funciona também via `file://`.
- Não testado em Safari/Firefox/aparelho físico nem contra um projeto Supabase real (ver seção 10).
- Importações muito grandes podem esbarrar no limite de tamanho de requisição do Supabase (o app limita arquivos a 20 MB).


## 12. Novidades: fotos, metas por objetivo, refeições salvas, exercícios

- **Fotos** (alimentos da biblioteca, refeições do diário, refeições salvas): escolha da galeria/computador, prévia antes de salvar, trocar e remover. O app converte para JPEG (até 1280 px, ≤ 1 MB, sem metadados EXIF). **Conta pessoal:** a imagem vai para o Supabase Storage (bucket privado `food-photos`, pasta com o seu id) e o banco guarda só a referência; a foto é exibida por URL assinada. O envio acontece **antes** de gravar o registro: se falhar, nada é salvo; se gravar o registro falhar, o arquivo enviado é removido. Um arquivo só é apagado do Storage quando nenhum registro o usa mais. **Demonstração:** as fotos ficam no IndexedDB do navegador e nunca saem dele. Não há reconhecimento por IA — a foto é só um registro visual.
- **Backup/restauração:** o JSON exportado leva as fotos embutidas (JPEG em base64, até 200 fotos de ≤ 400 KB cada) e as refeições salvas; ao importar, as fotos são reenviadas ao Storage da conta como arquivos novos. O backup não contém caminhos do Storage, `user_id` nem tokens.
- **Metas por objetivo:** Emagrecimento / Manutenção / Ganho de massa, com peso desejado e déficit/superávit. As metas ativas **só mudam com a sua confirmação**; trocar de objetivo apenas oferece usar as metas guardadas daquele objetivo. Nos cartões: consumido / meta, restante ou “acima da meta”, percentual; as barras **não** são cortadas em 100% (o excesso aparece listrado). Ultrapassar não é automaticamente ruim: proteína acima da meta nunca vira alerta; calorias no emagrecimento viram aviso âmbar (nunca vermelho de erro).
- **Refeições salvas** (aba *Refeições salvas* da Dieta, separada da biblioteca): nome, categoria, foto opcional, itens com quantidades, totais, favoritar, editar, duplicar, excluir, adicionar ao diário com um clique ou ajustando as quantidades. O diário recebe **cópias** dos itens: os totais do dia são sempre a soma dos itens (sem contagem dupla) e editar o modelo depois não altera dias já registrados.
- **Exercícios:** *Editar exercício* (nome, grupo muscular, descrição, excluir). Renomear atualiza o treino e o histórico de sessões, preservando cargas, repetições e o vínculo.
- **Visual:** cores fixas por nutriente (calorias verde, proteínas azul, gorduras amarelo, carboidratos roxo, água ciano, treinos verde), ícones padronizados, dashboard com resumo de macros, treino do dia, peso, resumo semanal e hidratação, temas claro/escuro e cores de destaque preservados.

**Gráfico de evolução das cargas (Progresso):** linha da maior carga de cada sessão com gradiente de desempenho (evolução, estável, queda) e, embaixo, **todas as séries** de cada sessão como pílulas com as repetições, cada uma colorida pela comparação com a mesma série da sessão anterior. Tocar em uma data mostra carga e repetições de cada série, total de séries e de repetições. A primeira sessão e séries sem par anterior ficam neutras (nada é estimado). **5 paletas** escolhíveis na hora, logo abaixo do gráfico (verde·azul·vermelho, verde·cinza·laranja, ciano·roxo·rosa, azul·cinza·laranja, verde·amarelo·vermelho), com símbolos ▲ ● ▼ opcionais para não depender só da cor. A escolha fica salva **neste aparelho** (`localStorage["fittrack_chartpal"]`), não na conta; não há mudança no banco. Código: `js/components/loadChart.js` e `css/loadchart.css`; teste: `tests/e2e/t10_loadchart.js`.

**Início, hidratação:** o cartão "Hidratação hoje" mantém a barra e ganha, à direita, a mesma garrafa da página Hidratação em tamanho menor, na cor da água (ciano, `--c-water`), com ondas e animação de encher. A página Hidratação continua com a garrafa na cor de destaque. **Início, resumo da semana:** calorias, proteínas, carboidratos e gorduras juntos, em barras lado a lado por dia, em % da meta do dia (acima de 100% a barra continua, hachurada; dias sem registro ficam fora das médias). Tocar em um dia mostra os valores reais e o que passou ou falta da meta. Sem mudança no banco. Código: `js/components/weekChart.js`, `css/weekchart.css` e `js/views/dashboard.js`; teste: `tests/e2e/t11_dashboard.js`.

**Limitações das fotos:** formatos que o navegador não decodifica (ex.: HEIC em alguns navegadores) são recusados com aviso; se a remoção de um arquivo no Storage falhar, pode sobrar um arquivo órfão (não aparece no app e só ocupa espaço); a exibição por URL assinada exige conexão.

**Testes novos:** `tests/sql/11_new_features.sql` (isolamento de Storage e tabelas novas), `tests/run-upgrade.sh` (migração 4 sobre dados existentes), `tests/e2e/t8_features.js` e `t9_demo_photos.js`. Para rodar só alguns: `tests/run-one.sh t8_features t9_demo_photos`. Lembrete: Storage real e supabase-js real **não** foram exercitados aqui (veja seção 10).

## Solução de problemas: "não foi possível alcançar o servidor" ao criar conta

A mensagem aparece quando a requisição **nem chegou** ao Supabase. Na tela de login/cadastro, use **Diagnosticar conexão**: ele testa, sem enviar dados seus, a configuração, o endereço do projeto, a chave pública e as opções de autenticação, e diz qual passo falhou. Causas mais comuns:

1. **URL errada em `js/config.js`** — deve ser exatamente `https://SEU-PROJETO.supabase.co` (Project Settings → API), sem `/rest/v1` e sem barra final. Um caractere errado no endereço gera "não resolveu o nome".
2. **Projeto pausado** — planos gratuitos pausam por inatividade; no painel, clique em *Restore project*. Enquanto pausado, nada responde.
3. **Chave errada** — use só a chave pública (publishable/anon), nunca a secret/service_role (o app recusa iniciar com ela).
4. **Bloqueio local** — extensão de bloqueio, antivírus, VPN, DNS ou rede corporativa. Teste em janela anônima/outra rede.
5. **Página aberta por `file://`** — rode `python3 -m http.server 8000` na pasta do projeto e abra `http://localhost:8000`.
6. **Biblioteca não carregou** (CDN bloqueado) — baixe o arquivo para `js/vendor/supabase.js` (ver seção supabase-js).

Outros erros agora aparecem com a causa real (e "Detalhes técnicos"), em vez de "sem conexão":
- *Cadastros desativados* → Authentication → Sign In / Providers → "Allow new users to sign up".
- *URL de retorno não autorizada* → Authentication → URL Configuration: coloque a **Site URL** e, em **Redirect URLs**, `http://localhost:8000/` (e a URL do GitHub Pages quando publicar).
- *Falha ao enviar e-mail* → o envio padrão do Supabase tem limite baixo por hora; configure um SMTP próprio ou aguarde.
- *E-mail não confirmado* → clique no link recebido, ou (só para testes) desligue "Confirm email" em Authentication → Sign In / Providers → Email.

Nenhuma alteração no banco é necessária para isso: as migrações 1–3 continuam as mesmas e nada foi recriado.
