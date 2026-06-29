@echo off
setlocal

cd /d "%~dp0"

:: ── Docker path ──────────────────────────────────────────────────────────────
where docker >nul 2>&1
if %errorlevel%==0 (
    echo Starting Universal DB Editor with Docker Compose...
    docker compose up --build
    goto :eof
)

:: ── Local dev path ────────────────────────────────────────────────────────────
echo Docker not found. Starting local dev servers instead.
echo.

:: Warn if npm is missing entirely
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm was not found. Install Node.js from https://nodejs.org
    pause
    goto :eof
)

:: Create .env if it doesn't exist
if not exist "server\.env" (
    if exist "server\.env.example" (
        copy /Y "server\.env.example" "server\.env" >nul
        echo Created server\.env from server\.env.example.
        echo.
        echo !! ACTION REQUIRED: open server\.env and replace ENCRYPTION_KEY
        echo    with a real 64-char hex key before saving any connections.
        echo    Generate one with:
        echo    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        echo.
        pause
    ) else (
        echo Warning: server\.env is missing and server\.env.example was not found.
    )
)

:: Install deps if node_modules is absent (covers fresh-zip case)
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd /d "%~dp0server"
    call npm install
    cd /d "%~dp0"
)

if not exist "client\node_modules" (
    echo Installing client dependencies...
    cd /d "%~dp0client"
    call npm install
    cd /d "%~dp0"
)

:: Start both dev servers in separate windows
start "Universal DB Editor - Server" cmd /k "cd /d "%~dp0server" && npm run dev"
start "Universal DB Editor - Client" cmd /k "cd /d "%~dp0client" && npm run dev"

echo.
echo Servers starting...
echo   Client: http://localhost:5173
echo   Server: http://localhost:3001
echo.
echo Close the two opened windows to stop the servers.

endlocal