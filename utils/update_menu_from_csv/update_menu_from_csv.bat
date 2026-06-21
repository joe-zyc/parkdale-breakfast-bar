@echo off
setlocal

cd /d "%~dp0..\.."

if "%~1"=="" (
  set "CSV_FILE=utils\update_menu_from_csv\parkdale_menu.csv"
) else (
  set "CSV_FILE=%~1"
)

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=py -3"
) else (
  set "PYTHON_CMD=python"
)

%PYTHON_CMD% utils\update_menu_from_csv\csv_to_menu_json.py "%CSV_FILE%"
if errorlevel 1 (
  echo Failed to update menu.json.
  exit /b 1
)

echo Updated src\data\menu.json from %CSV_FILE%.
