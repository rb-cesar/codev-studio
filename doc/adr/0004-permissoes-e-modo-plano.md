# ADR 0004: Permissões de ferramentas e modo plano pelo protocolo de controle

- **Status:** aceita (2026-10-28); implementada no passo 3 da aba Claude
- **Data:** 2026-10-28
- **Decisor:** César (pedido), Claude (detalhe técnico)
- **Relacionada:** [ADR 0001](0001-interface-claude-code.md), [ADR 0002](0002-transporte-executor.md), [ADR 0003](0003-sessoes-e-pasta.md)

## Contexto

Nos passos 1 e 2 ninguém respondia a pedidos de permissão: o `claude` negava tudo o que precisava de aprovação, então comandos de shell nunca rodavam na aba. O passo 3 deixa César aprovar ou negar cada ação na própria conversa e usar o modo plano, como no app oficial.

## Decisão

1. **Os pedidos chegam pelo `stdout`.** O `claude` é iniciado com `--permission-prompt-tool stdio` (no lugar de `--permission-prompts none`). Antes de uma ferramenta que precisa de aprovação, ele imprime um `control_request` de subtipo `can_use_tool` e espera um `control_response` no `stdin`. A resposta é `allow` (com `updatedInput` igual ao pedido original) ou `deny` (com uma mensagem que o Claude lê). Quando o turno é interrompido, o `claude` envia `control_cancel_request` e a janela some. O código que interpreta e monta esses objetos está em `src/lib/claude/permissions.js`, sem nada de tela nem de processo.
2. **Três modos**, escolhidos num popup no chip da barra de status da aba (mesmo estilo do popup de pastas): **Perguntar antes** (`default`), **Aceitar edições** (`acceptEdits`) e **Plano** (`plan`). Uma sessão nova começa em "Perguntar antes". A troca no meio da conversa usa o `control_request` `set_permission_mode`, sem reiniciar o processo. O modo vigente vem do evento `init` e de `EnterPlanMode`, para o chip nunca mostrar um modo que o `claude` não está usando.
3. **A janela de permissão** aparece acima do campo de texto com o que a ferramenta vai fazer (comando, arquivo gravado, trecho editado, endereço) e três botões: **Negar**, **Permitir nesta sessão** e **Permitir**. Pedidos simultâneos entram numa fila, com o contador de pendentes.
4. **"Permitir nesta sessão" só vale para a sessão.** O app reaproveita as sugestões do próprio `claude` (`permission_suggestions`: regras, pastas extras, modo), mas força `destination: "session"`. Nada é gravado nos arquivos de configuração do projeto nem do usuário. Se o pedido não traz sugestões, o botão equivale a "Permitir".
5. **Plano.** O `ExitPlanMode` chega como pedido com `requires_user_interaction` e o texto em `input.plan`. A aba mostra o plano em markdown e três saídas: **Continuar planejando** (nega com uma mensagem pedindo ajuste), **Aprovar e perguntar antes** e **Aprovar e aceitar edições** (as duas aprovam com `updatedPermissions: [{type: "setMode", ...}]` na sessão).
6. **`AskUserQuestion` (perguntas com opções) ainda não tem tela.** O app nega com a instrução "faça a pergunta em texto simples", e o Claude passa a perguntar em texto. Uma tela própria fica para depois.
7. **Nada é aprovado sozinho.** Um `allow` só sai quando César toca num botão de aprovação. Se o processo já terminou, a janela some sem resposta; se a resposta não puder ser escrita, a aba avisa e limpa a fila.

## Como foi verificado

- Testes unitários da leitura dos pedidos, das respostas, do modelo da conversa e da montagem do comando.
- Um teste de protocolo (`tests/unit/claudeProtocol.test.js`) roda o `claude` de verdade contra uma API Anthropic falsa local (`ANTHROPIC_BASE_URL`, ambiente limpo e pasta de configuração temporária), sem usar a conta. Cobre permitir, negar, regra de sessão, aprovação de plano com troca de modo, troca de modo e cancelamento. Sem o `claude` instalado, o teste é pulado.
- Teste de tela em Chromium sem interface, com largura de celular (390 px): chip e popup de modos, janela de permissão, plano, fila e cancelamento.

## Consequências

- `--permission-prompt-tool stdio` exige um Claude Code recente (2.1.31x, testado com 2.1.312). Com um `claude` mais antigo, ele falha ao iniciar e a aba mostra a saída de erro; `npm update -g @anthropic-ai/claude-code` resolve.
- Se o app for fechado ou o serviço morrer com um pedido aberto, o `claude` morre junto; a próxima mensagem retoma a sessão com `--resume` e o pedido pendente se perde.
- As regras "nesta sessão" valem enquanto o processo do `claude` viver. Depois de um `--resume` elas não voltam.
- Modo "Aceitar edições" ainda pede permissão para comandos de shell.
