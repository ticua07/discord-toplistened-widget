@echo off
REM ============================================================
REM  Borra la tarea programada "DiscordTopAlbums".
REM  Esto NO borra tus archivos ni el refresh.cmd, solo
REM  desregistra el disparador de inicio de sesion.
REM ============================================================

schtasks /Delete /TN "DiscordTopAlbums" /F

if %ERRORLEVEL%==0 (
  echo.
  echo Tarea "DiscordTopAlbums" eliminada. Ya no corre en el startup.
) else (
  echo.
  echo No se pudo borrar (quiza no existia). ERRORLEVEL %ERRORLEVEL%.
)
pause
