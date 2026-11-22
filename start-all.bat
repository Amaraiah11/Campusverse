@echo off
echo ========================================================
echo   Starting CampusVerse (Frontend + Node.js Backend)
echo ========================================================

start "CampusVerse Backend API (Port 5000)" cmd /k "cd backend && node --watch server.js"
start "CampusVerse Frontend (Port 5173)" cmd /k "npm run dev"

echo.
echo CampusVerse services launched!
echo - Frontend: http://localhost:5173
echo - Backend:  http://localhost:5000/api/health
echo ========================================================
