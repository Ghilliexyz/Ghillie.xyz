@echo off
cd /d "%~dp0"
python tools/update_portfolio.py %*
pause
