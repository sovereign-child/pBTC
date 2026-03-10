@echo off
title pBTC Command Center
cd /d "%~dp0"
node scripts/command-center.mjs %*
