# Codev Studio

Editor de código e terminal Linux no mesmo app Android, feito sobre o [Acode](https://github.com/Acode-Foundation/Acode) (licença MIT).

A ideia é ter no celular um ambiente de desenvolvimento completo: abrir o projeto, editar, rodar comandos num Ubuntu e usar o Claude Code, tudo no mesmo app.

> Projeto pessoal em desenvolvimento. Por enquanto gera apenas o APK de Android para arm64.

## O que muda em relação ao Acode

- **Ubuntu 24.04 no terminal.** O terminal embutido do Acode usa Alpine. Aqui ele roda Ubuntu via proot, com `apt` e alguns pacotes básicos já instalados (git, curl, wget, nano).
- **Claude no menu.** Um item fixo abre uma aba de conversa com o Claude Code, sem passar pelo terminal: respostas em streaming com markdown, chamadas de ferramenta recolhíveis, botão de parar e lista de sessões (nova, retomar, renomear). Cada sessão mostra a pasta em que trabalha, e as sessões iniciadas no terminal também aparecem. O ambiente do Ubuntu foi ajustado para o `claude` funcionar: `/tmp` com as permissões que ele exige, shells começando na pasta pessoal e `npm` instalando pacotes globais dentro do Ubuntu. O Claude Code em si é instalado pelo usuário, com Node.js e `npm install -g @anthropic-ai/claude-code`.
- **Comando `code`.** Funciona como o `code` do VS Code: `code .` abre a pasta atual na barra lateral e `code src/main.js` abre o arquivo no editor. A comunicação com o app é feita por uma sequência de escape do próprio terminal, sem abrir porta de rede.
- **Terminal local protegido.** O servidor local que conecta o app ao terminal passou a usar porta aleatória e um token por instalação, guardados em arquivos privados do app. Assim, outros apps do celular não conseguem abrir sessões no terminal.
- **Identidade própria.** Novo id de pacote (`dev.codev.studio`), nome, esquema de link (`codevstudio://`) e provedor de arquivos, para poder instalar junto com o Acode original. A verificação de atualização do Acode foi removida.

## Próximos passos

- Claude Code: janelas de permissão para ferramentas e modo plano na aba de conversa.
- Acesso remoto ao PC a partir do app, por SSH dentro de uma VPN, para trabalhar nos projetos do computador pelo celular.

## Build

O processo é o mesmo do Acode, descrito em [CONTRIBUTING.md](CONTRIBUTING.md). Clone com `--recurse-submodules`, porque o `codemirror-lsp-client` é um submódulo. O build está limitado a `arm64-v8a` (em `build-extras.gradle`), que é a arquitetura em que o servidor do terminal tem a verificação de token.

## Créditos e licença

Baseado no [Acode](https://github.com/Acode-Foundation/Acode), de Foxdebug (Ajit Kumar) e da Acode Foundation, distribuído sob a licença MIT ([license.txt](license.txt)). As alterações deste repositório seguem a mesma licença.
