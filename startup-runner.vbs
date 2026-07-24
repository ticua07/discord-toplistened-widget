' Lanza refresh.cmd de forma OCULTA (sin ventana de consola) al iniciar sesion.
' Esta copia se instala en la carpeta Startup de Windows.
Set sh = CreateObject("WScript.Shell")
projectDir = "C:\dev\topListenedWidgetDiscord"
sh.CurrentDirectory = projectDir
' El "0" = ventana oculta; False = no esperar a que termine.
sh.Run "cmd /c """ & projectDir & "\refresh.cmd""", 0, False
