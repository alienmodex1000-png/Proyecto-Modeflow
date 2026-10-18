@echo off
title ModeFlow AI - Servidor Local (Mode Agency)
color 0B
cd /d "%~dp0"

echo ======================================================================
echo    MODEFLOW AI (by Mode Agency) - PLATAFORMA LOCAL Y WHATSAPP 24/7
echo ======================================================================
echo.

if not exist node_modules\express (
    echo [*] Verificando dependencias web...
    call npm install express cors qrcode @whiskeysockets/baileys pino
    echo.
)

echo [*] Abriendo panel web en tu navegador: http://localhost:3355
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3355"

echo [*] Iniciando servidor y pasarela de WhatsApp en puerto 3355...
node server.js

pause

