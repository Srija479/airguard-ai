# AirGuard AI Rules

- AirGuard AI is a nationwide India air quality web app.
- Support English, Hindi, and Telugu via `react-i18next`; do not hardcode user-facing text.
- Never invent data.
- Label Open-Meteo data as "Modelled estimate".
- Label citizen reports as "Unverified".
- Build mobile-first interfaces and use plain language.
- Run checks and fix errors after each task.

DESIGN RULES (must not look AI-generated):
- Plain off-white page, dark text. NO gradients, NO glow, NO heavy shadows, NO glassmorphism.
- Colour only where it means something: AQI categories and warnings. Brand blue only for links and the active nav item.
- Small radius (6px max), thin 1px borders, generous whitespace. Use dividers and simple rows instead of grids of identical cards. Use a card only when grouping helps.
- One clear focal point per screen. Everything else is quiet and smaller.
- Icons only for function (nav, bell, map actions). No decorative icons or emoji.
- Plain, direct wording. No slogans or marketing copy.
- Empty states say what to do next. Show nothing the user does not need in order to decide or act.
- No bouncing, fading or decorative animation.
