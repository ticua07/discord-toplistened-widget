# Installation guide!!

First, go to https://discord.com/developers/applications (be signed in to your account in the web browser), then open the inspect tools (CTRL + SHIFT + I), go to the console tab and paste the "RUNME IN WEB BROWSER" script

NOTE: You might have to type "allow pasting" in the console first to paste the script.

It will probably ask you for a captcha and maybe your password + 2fa


Once you're finished the script (you know you finished if you are at the widget screen. Don't touch anything) copy the 3 DISCORD_ lines (one by one not all at the same time) and paste them into the .env file

the .env file will look something like this

```
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback


DISCORD_APP_ID=87234178123782
DISCORD_USER_ID=8123891238912389
DISCORD_BOT_TOKEN=REALLY LONG TEXT
```

after that you go to https://developer.spotify.com/dashboard logged in with the spotify account you want to track the songs with.

Create an app by clicking on the "Create app" button.

Set a name and description but most importantly add `http://127.0.0.1:8888/callback` to the Redirect URIs or IT WILL NOT WORK.

note: if spotify asks, set the app as development mode

Then click on the checkbox next to Web Api, agree to ToS and save the app

Once finished copy the client id and put it next to `SPOTIFY_CLIENT_ID` and do the same for `SPOTIFY_CLIENT_SECRET` (you might have to click on the "View Client Secret" button for it to show up)

# Final step

Now we're all set up, run `bun server.js` and go to `http://127.0.0.1:8888/login` in your browser. Accept the spotify application and close the app with Ctrl+C

finally run `bun updateRefresh.js` and then `.\install-startup-task.cmd` to autorun the script each time you turn on your PC.