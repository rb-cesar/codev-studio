# ADR 0001: Interface própria para o Claude Code, com sessões

- **Status:** aceita (decidida por César em 2026-10-27); implementação ainda não começou
- **Data:** 2026-10-27
- **Decisor:** César

## Contexto

Hoje o Claude Code roda no Codev Studio dentro de um terminal (Ubuntu via proot), aberto pelo comando `claude-code` em `src/lib/commands.js`. Funciona, mas é só terminal: o toque é ruim, a tela suja depois que o `claude` sai e não há uma lista de sessões como no app oficial do Claude Code para celular.

O objetivo é uma aba "Claude" que seja uma interface completa, não só um terminal, com:

- conversa em formato de chat;
- sessões (listar, criar, retomar, renomear), como no app oficial;
- pedidos de permissão de ferramentas e modo plano;
- o mesmo login do `claude` do terminal, sem pedir outra conta;
- a aparência e os temas do Codev Studio.

O app já tem editor, terminal e arquivos. Não queremos duplicar nada disso.

## Opções avaliadas

Pesquisa feita em 2026-10-27, a partir dos READMEs e da documentação. Nada foi testado no Ubuntu do app.

| Opção | Licença | Situação | Observação |
| --- | --- | --- | --- |
| [claude-code-webui](https://github.com/sugyan/claude-code-webui) (sugyan) | MIT | arquivado em 2026-05-29 | Servidor Hono + React que chama o `claude` com `--output-format stream-json`. Lista, carrega e retoma sessões. Sem login próprio. |
| [CloudCLI / claudecodeui](https://github.com/siteboon/claudecodeui) (siteboon) | AGPL-3.0-or-later, com termos extras na seção 7 | ativo (v1.37.x, 13 mil estrelas) | Chat, terminal, arquivos e git. Descobre sessões em `~/.claude`. Usa `node-pty` e `better-sqlite3`. Exige Node 22. |
| Interface sobre o [Agent SDK](https://code.claude.com/docs/en/agent-sdk/sessions) | termos comerciais da Anthropic | ativo | Tem `listSessions`, `resume`, `forkSession`, `canUseTool`. A documentação diz que produtos de terceiros devem usar chave de API, e não o login claude.ai. Também pede para não usar o nome "Claude Code" nem imitar o visual. |
| Interface sobre o [adaptador ACP](https://github.com/agentclientprotocol/claude-agent-acp) | Apache-2.0 | ativo | Dá `session/list`, `session/resume` e `session/fork`, mas não existe cliente web pronto. |
| [opcode](https://github.com/winfunc/opcode) | AGPL-3.0 | parado desde 2025-10 | App de desktop (Tauri), não serve para o celular. |

## Decisão

Escrever uma interface própria, dentro deste repositório, sem fork de nenhum dos projetos acima.

1. **Código nosso, licença do repositório (MIT).** O CloudCLI serve só como inspiração de recursos. Não se copia código dele, nem adaptado ou traduzido, porque isso traria a AGPL para o app. Para código copiado, a base permitida é o claude-code-webui (MIT), mantendo o aviso de licença original.
2. **A interface é uma aba do app.** O `EditorFile` já aceita abas que não são de arquivo (`type: "page"`, usadas pelo preview de markdown). A tela do chat é DOM/HTML dentro do próprio WebView, sem iframe e sem servidor web, herdando os temas existentes.
3. **O backend é o `claude` do Ubuntu**, chamado em modo `-p --input-format stream-json --output-format stream-json --verbose`, com `--resume <id>` para retomar. Assim a conta é a do terminal, sem API key, e o Agent SDK fica fora do caminho por causa da regra de login de terceiros.
4. **Ligação com o app.** Primeira tentativa: o modo `axs lsp` do `axs` embutido, que liga o stdin/stdout de um programa a um WebSocket (já usado pelo suporte a LSP, em `src/cm/lsp/runtimes/axsBridge.ts`). Reaproveita a porta aleatória e o token do terminal. Plano B: um servidor Node pequeno no Ubuntu, também com porta aleatória e token por instalação.
5. **Sessões** vêm de `~/.claude/projects/<pasta-codificada>/<id>.jsonl`, o formato descrito na documentação do Agent SDK.
6. **O botão "Claude" do app abre só a interface gráfica** (decidido por César em 2026-10-28; o comando `claude-code`, que abria um terminal, foi removido). O `claude` continua disponível digitando-o num terminal comum.

## Consequências

- Não dependemos da manutenção de nenhum projeto de terceiros. O custo é nosso: se uma versão nova do Claude Code mudar o formato do `stream-json`, o conserto é por nossa conta.
- Esforço maior do que usar o CloudCLI pronto, menor do que montar tudo sobre o SDK ou o ACP, porque o servidor é fino e a tela de chat é HTML nosso.
- Não há arquivos, git nem terminal duplicados; usamos os que o app já tem.
- O nome da aba e o visual devem ser do Codev Studio, sem imitar o Claude Code.

## O que ainda não foi verificado

- Se o `axs lsp` repassa mensagens como texto puro ou com enquadramento LSP (`Content-Length`). Só dá para saber testando no celular. Se for LSP, o cliente da aba trata o enquadramento ou passamos para o plano B.
- Se o formato `stream-json` do Claude Code 2.1.310 é compatível com o que o claude-code-webui espera.
- O comportamento do teclado do WebView num campo de chat longo.
- Se a conta Pro limita o uso do `claude -p` por processos não interativos. Pelo que consta, é o mesmo uso do CLI, mas não foi confirmado.
- Termos extras da seção 7 da licença do CloudCLI (não lidos; irrelevantes enquanto não houver cópia de código).

## Primeira versão (a combinar)

1. Aba "Claude" com conversa, campo de texto e botão de parar.
2. Lista de sessões: nova, retomar, renomear.
3. Janelas de permissão de ferramentas e modo plano ([ADR 0004](0004-permissoes-e-modo-plano.md)).
4. Botão "Claude" na tela de boas-vindas abrindo a aba na pasta do projeto.

Cada passo vai em PR separado, para ser testado no APK antes do seguinte.
