# PitchIQ Owners Portal

Owner analytics + site ops for The Pitch Predictor.

## Live entry

- **Desktop:** `https://thepitchpredictor.com/owners/` (Owner's Settings on `app.html`)
- **Mobile:** `https://thepitchpredictor.com/owners/mobile.html` (Owner's Settings in the mobile hamburger menu)

Narrow viewports on `/owners/` redirect to `mobile.html` (use `?desktop=1` to force desktop). Wide viewports on `mobile.html` redirect to `index.html` (use `?mobile=1` to force mobile).

## Local

From this folder, double-click `start-dashboard.bat` (port **8090**), or:

```powershell
python -m http.server 8090
```

For the full site (app + owners together), run `../start-local-server.bat` from `PitchIQ Webpage` (port **8080**), then open `/owners/`.
