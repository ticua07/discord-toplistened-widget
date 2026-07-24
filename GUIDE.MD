# 🚀 Installation Guide

> **Disclaimer**
>
> This project was mostly **vibe coded** as a fun side project. While it works, it isn't representative of how I normally write my code.

---

## Prerequisites

Before starting, make sure you have:

- **Bun** installed: https://bun.sh/
- A Discord account
- A Spotify account

---

# 1. Set up the Discord Application

Go to:

https://discord.com/developers/applications

Make sure you're signed into the Discord account you want to use.

### Run the setup script

1. Open Developer Tools (`Ctrl + Shift + I`)
2. Go to the **Console** tab.
3. Paste the **"RUNME IN WEB BROWSER"** script.

> **Note**
> If Discord prevents you from pasting into the console, type:
>
> ```
> allow pasting
> ```
>
> and press Enter before pasting the script.

During the process Discord may ask you to complete:

- a CAPTCHA
- your password
- 2FA verification

This is normal.

---

## Copy the generated values

When the script finishes, you'll end up on the widget screen.

**Don't click anything else.**

Copy these three values **one at a time** into your `.env` file:

- `DISCORD_APP_ID`
- `DISCORD_USER_ID`
- `DISCORD_BOT_TOKEN`

Your `.env` should look similar to this:

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback

DISCORD_APP_ID=87234178123782
DISCORD_USER_ID=8123891238912389
DISCORD_BOT_TOKEN=REALLY_LONG_TOKEN
```

---

# 2. Create a Spotify Application

Open:

https://developer.spotify.com/dashboard

Sign in with the Spotify account you want the widget to track.

Create a new application by clicking **Create app**.

Fill in any name and description you like.

## Important

Add the following Redirect URI:

```
http://127.0.0.1:8888/callback
```

⚠️ **If you forget this step, authentication will not work.**

If Spotify asks whether the app should be in Development Mode, choose **Yes**.

When creating the app:

- Enable the **Web API** checkbox.
- Accept the Terms of Service.
- Save the application.

---

## Copy your Spotify credentials

From your Spotify application's dashboard:

- Copy the **Client ID** into:

```
SPOTIFY_CLIENT_ID=
```

- Click **View Client Secret**
- Copy the **Client Secret** into:

```
SPOTIFY_CLIENT_SECRET=
```

---

# 3. Authenticate with Spotify

Start the authentication server:

```bash
bun server.js
```

Open your browser and visit:

```
http://127.0.0.1:8888/login
```

Authorize the Spotify application.

Once the browser confirms authentication, return to the terminal and stop the server with:

```text
Ctrl + C
```

---

# 4. Update your profile for the first time

Run:

```bash
bun updateRefresh.js
```

If the widget appears in your profile then you're done with the setup!

---

# 5. Enable Auto Startup (Optional)

If you want the widget to update automatically every time your PC starts, run:

```powershell
.\install-startup-task.cmd
```

---

# 🎉 Done!

Everything should now be configured and ready to go.

If something doesn't work, double-check:

- ✅ Bun is installed.
- ✅ Your `.env` values are correct.
- ✅ The Spotify Redirect URI is exactly:

```
http://127.0.0.1:8888/callback
```

- ✅ You copied the Discord values correctly.