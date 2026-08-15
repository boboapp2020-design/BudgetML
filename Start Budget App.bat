@echo off
rem เปิด Annual Budget Planner — รัน local server แล้วเปิด browser ให้อัตโนมัติ
start "BudgetAppServer" /min powershell -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
timeout /t 2 >nul
start "" http://localhost:8123
