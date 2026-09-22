@echo off
title AI Job Finder - Local Dev Servers

echo Starting AI Job Finder Backend...
start "Backend Server" cmd /k "cd backend && node --watch .\server.js"

echo Starting AI Job Finder Frontend...
start "Frontend Server" cmd /k "cd frontend && npm run dev"

echo Both servers are starting up! You can close this window.
exit
