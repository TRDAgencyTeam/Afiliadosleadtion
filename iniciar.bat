@echo off
echo ============================================
echo   Panel de Afiliados v4 - Iniciando...
echo ============================================
echo.
node -v >nul 2>&1
if errorlevel 1 (echo ERROR: Node.js no instalado. Ve a https://nodejs.org & pause & exit /b 1)
if not exist "node_modules" (echo Instalando dependencias... & npm install & echo.)
echo Abriendo http://localhost:3000
timeout /t 2 /nobreak >nul
start http://localhost:3000
echo Servidor corriendo. Ctrl+C para detener.
echo.
node server.js
pause
