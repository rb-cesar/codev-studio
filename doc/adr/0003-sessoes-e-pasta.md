# ADR 0003: Sessões lidas dos arquivos do Claude Code, com pasta explícita

- **Status:** aceita (2026-10-28); implementada no passo 2 da aba Claude
- **Data:** 2026-10-28
- **Decisor:** César (pedidos), Claude (detalhe técnico)
- **Relacionada:** [ADR 0001](0001-interface-claude-code.md), [ADR 0002](0002-transporte-executor.md)

## Contexto

O passo 1 abria uma conversa única, sempre na primeira pasta aberta na barra lateral (no teste de César, `rea/docs`), sem como voltar a uma conversa anterior. César pediu a lista de sessões do app oficial (nova, retomar, renomear), que a sessão deixe de estar presa a uma pasta que ele não escolheu, e que o botão "Claude" do menu abra só a interface gráfica.

## Decisão

1. **A lista vem dos arquivos do próprio Claude Code**, `~/.claude/projects/<pasta>/<id>.jsonl` dentro do Ubuntu, lidos por scripts Node curtos (`src/lib/claude/sessionScripts.js`) executados com `Executor.execute`. Assim aparecem também as sessões iniciadas no terminal, e nada novo precisa ser guardado pelo app. Os scripts são strings de texto e imprimem `@@JSON@@` seguido de JSON, para ignorar qualquer ruído do shell.
2. **Título de uma sessão:** título dado pelo usuário (`custom-title`), senão o da IA (`ai-title`), senão a primeira pergunta. Para listar, cada arquivo é lido só no começo e no fim (96 KB de cada lado), então sessões grandes não custam caro.
3. **Retomar** é `claude --resume <id>` na pasta da sessão, e o histórico mostrado vem da leitura do mesmo arquivo (últimas 300 entradas, textos e entradas de ferramentas encurtados para não pesar na ponte do Cordova).
4. **Renomear** acrescenta ao arquivo da sessão uma linha `{"type":"custom-title","customTitle":...,"sessionId":...}`, o mesmo formato que o Claude Code usa (a última linha vale).
5. **Cada sessão tem uma pasta explícita**, mostrada no topo da aba. **Uma sessão nova sempre começa na home do Ubuntu** (`/public`), sem tentar adivinhar a pasta do projeto aberto no editor: a primeira versão tentava (pasta do arquivo em edição, com conversão de pastas do seletor do Android para `/storage/...`), mas ficava presa em `rea/docs` e não acompanhava o que César esperava, então foi removida. Enquanto a sessão está vazia, tocar no topo abre um popup junto ao botão, no estilo dos botões do chat, com a home em primeiro lugar e as pastas dela até dois níveis (`projetos`, `projetos/rea`, sem pastas ocultas nem `node_modules`). Depois da primeira mensagem a pasta não muda, porque o Claude Code guarda a sessão por pasta; retomar uma sessão usa a pasta onde ela começou.
6. **O botão "Claude" do menu, da tela de boas-vindas e da paleta abre só a aba gráfica.** O comando `claude-code`, que abria um terminal, foi removido.
7. **Pasta inexistente é erro, não troca silenciosa.** O comando do `claude` antes fazia `cd "$pasta" || cd /public`; agora, se o `cd` falha (por exemplo, uma sessão antiga cuja pasta foi apagada), ele escreve o motivo e sai com código 97, e a aba mostra o erro.

## Consequências

- Se o formato dos arquivos do Claude Code mudar, a lista ou o histórico podem sair incompletos; o resto da aba continua funcionando, e os scripts têm testes com arquivos de exemplo e com transcrições reais.
- Listar e abrir uma sessão inicia um processo Node dentro do proot (cerca de um segundo).
- Não há exclusão de sessões nesta versão.
- Dois arquivos com o mesmo id em pastas diferentes (possível ao retomar uma sessão de outra pasta) aparecem duas vezes na lista, e a abertura usa o primeiro encontrado.
