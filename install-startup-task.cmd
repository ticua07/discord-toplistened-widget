@echo off
REM ============================================================
REM  Registra una tarea programada que corre refresh.cmd cada
REM  vez que inicias sesion en Windows (no a una hora fija).
REM
REM  - /SC ONLOGON : se dispara al iniciar sesion tu usuario.
REM  - /DELAY 0000:30 : espera 30s para que la red este lista
REM    antes de hablar con Spotify/Discord.
REM
REM  Para sacarla: corre uninstall-startup-task.cmd
REM ============================================================

schtasks /Create ^
  /TN "DiscordTopAlbums" ^
  /TR "%~dp0refresh.cmd" ^
  /SC ONLOGON ^
  /DELAY 0000:30 ^
  /F

if %ERRORLEVEL%==0 (
  echo.
  echo Created "DiscordTopAlbums" task. runs everytime you login.
  @REM echo Para probarla ya: schtasks /Run /TN "DiscordTopAlbums"
) else (
  echo.
  echo Fallo al crear la tarea (ERRORLEVEL %ERRORLEVEL%^).
)
pause
