# PitchIQ Owners Portal

Owner analytics + site ops for The Pitch Predictor.

## Live entry

On the customer app (`app.html`), **Owner's Settings** (owner role only) opens this portal at:

`https://thepitchpredictor.com/owners/`

(or `./owners/` relative to wherever the Webpage is hosted)

## Local

```powershell
cd "PitchIQ Webpage\owners"
python -m http.server 8080
```

Or open via the main site after signing in as owner.

## Source of truth

Develop in `PitchIQ Report\HTML Version\`, then sync into the live Webpage folder:

```powershell
robocopy "PitchIQ Report\HTML Version" "PitchIQ Webpage\owners" /E
```

## Data

Sign in with your PitchIQ owner account. Loads `pitchiq_historical_rows` from the same Supabase project as the customer site (session is shared on the same origin).
