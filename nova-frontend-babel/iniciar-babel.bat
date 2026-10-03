@echo off
rem Babel OS - serve a pasta em http://localhost:8080 e abre o app (Windows)
cd /d "%~dp0"
if exist edge-tts\.venv\Scripts\python.exe (
  start "Babel Edge" /min edge-tts\.venv\Scripts\python.exe edge-tts\server.py --port 3100
  echo Vozes BR (Edge) em http://localhost:3100
)
where node >nul 2>nul
if %errorlevel%==0 (
  start "Babel Cerebro" /min node cerebro\server.js
  echo Cerebro Babel em http://localhost:3078
)
start http://localhost:8080/
echo.
echo Babel OS em http://localhost:8080/ - deixe esta janela aberta.
echo No Chrome, so na primeira vez: clique no cadeado ao lado do endereco - Microfone - Permitir.
echo.
python servir.py 8080
