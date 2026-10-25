@echo off
title SteelSafe Intelligence - YOLOv8n Training
cd /d "%~dp0"
echo ===================================================
echo Starting SteelSafe YOLOv8n Training on CPU...
echo ===================================================
".venv\Scripts\python.exe" train.py
pause
