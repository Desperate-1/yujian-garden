@echo off
rem ============================================================
rem  MindGarden - One-click launcher
rem
rem  [2026-10-15 rewritten] Why this file changed:
rem  the user reported "a window flashes and vanishes, I cannot
rem  read anything". The old version did:
rem      start "MindGarden" powershell ... -File Start-MindGarden.ps1
rem  i.e. it put PowerShell into a BRAND NEW window, while this cmd
rem  window closed immediately by design. So whenever that new
rem  window failed to come up (or came up and exited at once), the
rem  error message vanished together with it and the user was left
rem  staring at nothing.
rem
rem  Now everything runs in THIS single window:
rem    - PowerShell runs here (no `start`, no second window)
rem    - absolute path to powershell.exe (no PATH dependency)
rem    - `pause` at the end, so the window can NEVER self-close
rem    - exit code is shown, so a silent failure is impossible
rem  Chinese output still comes from Start-MindGarden.ps1, which
rem  prints through the Unicode console API, so it renders fine.
rem
rem  [!] READ BEFORE EDITING Start-MindGarden.ps1
rem  That .ps1 MUST stay saved as UTF-8 **with BOM**. Windows
rem  PowerShell 5.1 (the one this .bat calls) falls back to the
rem  ANSI codepage for BOM-less .ps1 files: the Chinese text gets
rem  garbled and the script dies with parse errors such as
rem  "Unexpected token" or "The string is missing the terminator".
rem  Most editors drop the BOM when saving, so after editing that
rem  file, re-save it WITH the BOM.
rem
rem  This file is deliberately ASCII-only AND uses an ASCII script
rem  name. cmd.exe mis-parses UTF-8 Chinese bytes inside .bat files
rem  (it splits them and reports errors like "'ll' is not ..."),
rem  and Chinese characters in the script path can be mangled too.
rem  All Chinese output is printed by Start-MindGarden.ps1 instead.
rem ============================================================

cd /d "%~dp0"

title MindGarden launcher

rem  Leave a trace that survives a vanishing window: if the user ever
rem  reports "it just flashes", this file tells us how far it got.
rem  (MindGarden\logs already exists; it is used by the app as well.)
if not exist "%~dp0MindGarden\logs" mkdir "%~dp0MindGarden\logs"
set "LOGF=%~dp0MindGarden\logs\launcher.log"
echo [%DATE% %TIME%] bat start >> "%LOGF%" 2>nul

set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell"

echo.
echo   MindGarden  -  starting, please wait (about 10-60 seconds)...
echo   First start on a new computer can take a few minutes.
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-MindGarden.ps1"
set "RC=%ERRORLEVEL%"
echo [%DATE% %TIME%] powershell finished, exit=%RC% >> "%LOGF%" 2>nul

echo.
echo  ============================================================
echo   The launcher has finished. Exit code = %RC%
echo   (0 = success. Anything else = failed, see the red text above.)
echo.
echo   If it failed: screenshot THIS window, then read
echo     README.md
echo   Press any key to close this window.
echo  ============================================================
pause >nul
exit /b %RC%
