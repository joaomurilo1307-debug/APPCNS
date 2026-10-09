# scripts/

Ferramentas de TI/rollout, fora do app em si (não fazem parte do build/deploy do Next.js).

## Homologação local do financeiro/Itaú

As regras de forma exclusiva do título, conferência direcionada e indicação de cartão estão em [Conferência da Programação de Pagamento](../docs/conferencia-programacao-pagamento.md).

O procedimento atual do setor está em [Retorno Itaú → baixa na Sênior](../docs/fluxo-retorno-itau-baixa-senior.md). A suíte HTTP exige que o servidor alvo também confirme a base de teste e a Sênior simulada antes de qualquer escrita.

`npm run homologacao:preparar` cria a base PostgreSQL separada `consominas_gestao_itau_homologacao`, configura `.env.homologacao` e insere somente dados fictícios. Requer `.env` apontando para `localhost`/`127.0.0.1` e a base original `consominas_gestao_dev`. O esquema é aplicado exclusivamente à nova base, sem copiar credenciais reais da Sênior.

Para uso manual, execute `npm run homologacao:senior` e `npm run homologacao:dev` em terminais separados. O app abre em `http://localhost:3001`; login e senha estão no arquivo local `.env.homologacao`, ignorado pelo Git.

`npm run test:financeiro` verifica o processamento com a base local. `npm run test:financeiro:http` exige o app ativo e porta 3099 livre: ele inicia seu próprio SOAP simulado. Encerre o simulador manual antes dessa suíte. `npm run homologacao:build` verifica a compilação; encerre o app de desenvolvimento antes de compilar para evitar disputa pelo cache. Depois de compilar, `npm run homologacao:start` serve a versão compilada na porta 3001.

Consulte [o relatório de auditoria](../docs/auditoria-financeiro-itau-2026-10-08.md) para achados, evidências e limites da homologação. Os arquivos fictícios não devem ser enviados ao banco.

## Instalar-ConsominasGestao-AutoAbrir.ps1

Faz o Consominas Gestão abrir automaticamente (numa janela própria do Edge, sem abas/barra) toda vez que
alguém ligar/entrar num computador. Roda uma vez por máquina, como Administrador.

Requer `consominas-gestao.ico` na mesma pasta (usado como ícone do atalho).

```powershell
powershell -ExecutionPolicy Bypass -File .\Instalar-ConsominasGestao-AutoAbrir.ps1
```

Se a empresa tiver domínio/Active Directory, o mesmo script pode virar um script de logon via GPO
em vez de ser rodado manualmente em cada máquina — falar com quem administra o AD.

Para desfazer: apagar `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\Consominas Gestao.lnk`.
