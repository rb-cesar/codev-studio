# ADR 0002: Ligação da aba Claude ao `claude` pelo Executor nativo

- **Status:** aceita (2026-10-28); implementada no passo 1 da aba Claude
- **Data:** 2026-10-28
- **Decisor:** César (plano), Claude (detalhe técnico)
- **Relacionada:** [ADR 0001](0001-interface-claude-code.md), que previa o modo `axs lsp` como primeira tentativa

## Contexto

A ADR 0001 propôs ligar a aba ao `claude` pelo modo `axs lsp` do `axs` embutido, com um servidor Node pequeno como plano B, e deixou em aberto como o `axs lsp` empacota as mensagens.

Ao ler o código para implementar, apareceu uma opção melhor: o plugin do terminal expõe `Executor.start(comando, callback, alpine)`. Ele inicia um processo, entrega cada linha de `stdout` e `stderr` ao JavaScript e aceita `Executor.write(uuid, texto)` para o `stdin` (acrescenta `\n`). Com `alpine = true` o comando roda dentro do Ubuntu (proot), pelo mesmo caminho `init-sandbox.sh` → `init-alpine.sh` que o terminal usa (`exec "$@"`).

## Decisão

Usar `Executor.start` para manter um `claude -p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` vivo entre os turnos. Cada pergunta é uma linha JSON no `stdin` e cada evento é uma linha JSON no `stdout`.

Por quê:

- **Sem rede.** Não abre porta, então não precisa de token nem de porta aleatória, e outros apps do celular não têm como falar com o processo.
- **Sem formato desconhecido.** O `stream-json` é uma linha JSON por evento, e o `Executor` já entrega linha por linha. A dúvida sobre o enquadramento do `axs lsp` deixa de existir.
- **Sem terminal no meio.** O `axs` do terminal é um PTY; usá-lo traria eco, edição de linha e códigos de escape para dentro do JSON.
- **Sem servidor novo para manter.**

A linha de comando é montada com `quotePosixShellArg` para cada argumento, e o texto digitado nunca entra nela, só no `stdin`. A pasta do projeto e o `--resume` são os únicos valores variáveis.

## Consequências

- O processo vive no serviço em primeiro plano do `Executor`, com a notificação que ele já mostra. Se o Android matar o serviço, a próxima mensagem inicia outro processo com `--resume <id da sessão>`.
- Nos passos 1 e 2 ninguém respondia a pedidos de permissão: o `claude` rodava com `--permission-prompts none`, e tudo o que pediria permissão era negado. O passo 3 trocou isso pelo protocolo de controle do `stream-json` (`--permission-prompt-tool stdio`), descrito na [ADR 0004](0004-permissoes-e-modo-plano.md).
- As opções do `claude` usadas aqui foram testadas no Claude Code 2.1.312. Se o `claude` do celular for mais antigo e não conhecer uma opção, ele falha ao iniciar e a aba mostra a saída de erro; `npm update -g @anthropic-ai/claude-code` resolve.
- Interromper um turno envia um `control_request` de `interrupt`. Se o `claude` não responder em 4 segundos, a aba encerra o processo e a conversa continua depois por `--resume`.
- A ADR 0001 continua valendo no resto. O trecho sobre o `axs lsp` fica como alternativa descartada.
