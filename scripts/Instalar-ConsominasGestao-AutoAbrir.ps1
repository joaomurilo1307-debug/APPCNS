<#
    Instalar-ConsominasGestao-AutoAbrir.ps1

    O que faz:
    - Copia o icone oficial do Consominas Gestao pra uma pasta local fixa da maquina.
    - Cria um atalho na pasta de Inicializacao COMUM do Windows (ProgramData), que roda
      pra QUALQUER pessoa que logar nessa maquina, sem precisar configurar nada por usuario.
    - O atalho abre o sistema numa janela propria do Edge (sem abas/barra de navegador),
      igual um programa instalado.

    Como usar:
    - Rodar UMA VEZ em cada computador, como Administrador (obrigatorio: grava em ProgramData).
    - Clique direito no arquivo -> "Executar com PowerShell" (como admin), ou:
        powershell -ExecutionPolicy Bypass -File .\Instalar-ConsominasGestao-AutoAbrir.ps1
    - Se a empresa tiver dominio/Active Directory, dá pra distribuir isso como script de
      logon/GPO em vez de rodar manualmente em cada maquina — falar com quem administra o AD.

    Pra desfazer (parar de abrir sozinho): apagar o atalho em
    C:\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\Consominas Gestao.lnk
#>

#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

$appUrl      = "https://gestao.srv1834707.hstgr.cloud/dashboard"
$appName     = "Consominas Gestao"
$iconDestDir = "$env:ProgramData\ConsominasGestao"
$iconDest    = "$iconDestDir\icon.ico"
$startupDir  = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp"
$startMenuDir = "$env:ProgramData\Microsoft\Windows\Start Menu\Programs"

# 1) acha o Edge (padrao no Windows) ou cai pro Chrome se o Edge nao existir
$edgePaths = @(
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)
$browserExe = ($edgePaths + $chromePaths) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $browserExe) {
    Write-Error "Nao encontrei Edge nem Chrome instalado nesta maquina. Instale um dos dois e rode este script de novo."
    exit 1
}

# 2) copia o icone pra um lugar fixo (nao pode apontar o atalho pro icone dentro do perfil de outra pessoa)
New-Item -ItemType Directory -Force -Path $iconDestDir | Out-Null
Copy-Item -Path "$PSScriptRoot\consominas-gestao.ico" -Destination $iconDest -Force

# 3) cria o atalho na pasta de Inicializacao COMUM (roda pra todo mundo que logar na maquina)
New-Item -ItemType Directory -Force -Path $startupDir | Out-Null
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut("$startupDir\$appName.lnk")
$shortcut.TargetPath = $browserExe
$shortcut.Arguments  = "--app=`"$appUrl`" --start-maximized"
$shortcut.IconLocation = $iconDest
$shortcut.Description = "Abre o Consominas Gestao automaticamente ao ligar o computador"
$shortcut.Save()

# 4) tambem cria um atalho no Menu Iniciar (pra quem fechar e quiser reabrir manualmente)
$startMenuShortcut = $shell.CreateShortcut("$startMenuDir\$appName.lnk")
$startMenuShortcut.TargetPath = $browserExe
$startMenuShortcut.Arguments  = "--app=`"$appUrl`" --start-maximized"
$startMenuShortcut.IconLocation = $iconDest
$startMenuShortcut.Description = "Consominas Gestao"
$startMenuShortcut.Save()

Write-Host ""
Write-Host "Pronto. O Consominas Gestao vai abrir sozinho na proxima vez que qualquer pessoa" -ForegroundColor Green
Write-Host "logar neste computador. Tambem foi criado um atalho no Menu Iniciar." -ForegroundColor Green
Write-Host ""
Write-Host "Navegador usado: $browserExe"
