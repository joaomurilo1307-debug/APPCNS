# scripts/

Ferramentas de TI/rollout, fora do app em si (não fazem parte do build/deploy do Next.js).

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
