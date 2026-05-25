# CodeAlpha_PhishGuard

> An interactive, gamified phishing-awareness web app — built for the **CodeAlpha Cyber Security Internship (Task 2)**.

PhishGuard drops the learner inside a realistic email inbox and asks them to hunt the red flags. Every click is scored, every mistake is explained — and an optional AI tutor (Groq `openai/gpt-oss-20b`) gives personalised feedback in plain English.

🔗 **Repo:** https://github.com/looelhawari/CodeAlpha_PhishGuard
📺 **Video walkthrough:** *(coming soon — link will be added here and in the LinkedIn post)*
🌐 **Live demo:** *(deploy `public/` to GitHub Pages — instructions below)*

---

## About the project

The official task asked for *"a presentation or online module focused on phishing attacks"*. A slide deck is forgettable. **PhishGuard turns the same content into something you actually play** — and proves you understood the material by scoring you on it.

It covers every bullet in the brief:

| CodeAlpha Task 2 requirement | How PhishGuard delivers it |
|---|---|
| Create a presentation **or online module** | Single-page web app, hostable on GitHub Pages |
| Explain how to recognise phishing emails & fake sites | 12 real-world-style email samples with clickable indicators |
| Educate about social-engineering tactics | Indicators tagged by tactic (urgency, authority, fear, reward, pretexting…) |
| Provide best practices and tips | "What to look for" cheatsheet panel always visible while playing |
| Include real-world examples and interactive quizzes | 12 emails across 4 difficulty tiers + scoring + final report |

---

## Why this is different

Most phishing-training submissions are static slide decks. PhishGuard plays like a game and teaches like a tutor:

- 🎯 **Click-to-flag mechanic** — instead of reading about red flags, you spot them yourself on a live email
- 📈 **Adaptive difficulty** — harder tiers unlock as your score grows (Easy → Medium → Hard → APT-grade)
- ⚖️ **Legitimate emails included** — false positives cost points, so learners can't just click everything
- 🤖 **AI tutor (optional)** — Groq-powered backend explains each missed indicator in plain English
- 🧾 **Final report card** — "You'd survive X% of attacks", broken down by indicator type

| Capability | Typical training | PhishGuard |
|---|---|---|
| Format | slides / video | interactive web app |
| Engagement | passive | clickable indicator hunt |
| Examples | 1–2 | 12 across 4 difficulty tiers |
| Scoring | none | per-indicator, per-email, total |
| Adaptive | no | difficulty unlocks as you score |
| Legit emails included | rare | yes — false positives cost points |
| AI feedback | none | Groq tutor explains each miss |
| Hostable | needs uploads | static site, GitHub Pages-ready |

## What you'll learn by playing

- **Spoofed senders** — display-name vs. real address mismatch, typo-squatted domains, lookalike internal mail
- **Deceptive links** — hover-text vs. real URL, brand impersonation
- **Urgency & fear** — "24-hour" deadlines, "account locked", legal threats
- **Generic greetings** — "Dear customer" vs. your actual name
- **Risky attachments** — `.exe`, `.zip`, macro-enabled docs
- **Credential harvesting** — "verify your password" prompts
- **Business Email Compromise (BEC)** — sudden banking-details changes from "your" vendor
- **Spear-phishing & APT lures** — executive impersonation, ego-bait conference invites, fake recruiters

## Difficulty tiers

| Tier | Examples | What they teach |
|---|---|---|
| Easy | "Nigerian prince", "you won an iPhone" | Obvious indicators |
| Medium | PayPal / Microsoft / DHL impersonation | Typo-squat domains, urgency |
| Hard | Internal IT lookalike, vendor BEC | Subtle sender spoofs |
| APT | C-level impersonation, conference invites, fake recruiters | Pretexting + targeted craft |

## Getting started

PhishGuard works in two modes:

### 1. Static-only (no backend, no API key needed)

```bash
cd public
python -m http.server 8000
# open http://localhost:8000
```

That's it — the full game runs in the browser, ready to share with a class or team.

### 2. With the AI tutor (Flask + Groq)

```bash
pip install -r requirements.txt
cp .env.example .env  # then paste your Groq API key from https://console.groq.com
python -m src.app
# open http://localhost:5057
```

When the backend is live, the "AI Tutor" panel turns green and learners can ask:
*"Why was this a phishing email?"* — and get a tailored explanation grounded in the specific email and which indicators they missed.

### Deploy as a public demo (GitHub Pages)

1. In repo **Settings → Pages**, set the source to the **`/public`** folder on the `main` branch.
2. Your demo is then live at `https://looelhawari.github.io/CodeAlpha_PhishGuard/`.
3. Paste that link into the LinkedIn post.

## How it works

1. `public/data/emails.json` defines each email (headers, body HTML, list of indicators with CSS selectors, explanations).
2. The frontend renders the inbox and binds clickable regions in the email to indicator IDs.
3. Learner clicks → app marks the region and tracks hits.
4. On submission, the app compares clicks to the ground-truth indicator list, scores the round, and reveals every indicator (caught or missed) with its explanation.
5. After all emails are reviewed, the final report shows accuracy per indicator type so the learner sees their weak spots.

## Project layout

```
public/                   # static SPA (deployable on its own)
├── index.html
├── styles.css
├── app.js                # game engine
└── data/
    └── emails.json       # 12 hand-crafted samples (8 phishing, 4 legit)
src/                      # optional Flask backend for the AI tutor
├── app.py                # /api/explain, /api/generate, /healthz
└── groq_client.py
requirements.txt          # Flask + Groq + python-dotenv
.env.example              # template for the API key
.env                      # your real key (gitignored)
```

## Tech stack

- **Frontend:** vanilla HTML/CSS/JavaScript (no framework, zero build step)
- **Backend (optional):** Flask + Flask-CORS + python-dotenv
- **AI tutor:** Groq SDK against `openai/gpt-oss-20b`
- **Hosting target:** GitHub Pages (static portion)

## Adding your own emails

`public/data/emails.json` is the only file you edit. Each entry:

```json
{
  "id": "hard-09",
  "difficulty": "hard",
  "isPhishing": true,
  "from": { "name": "IT Helpdesk", "address": "helpdesk@yourcompany-it.co" },
  "to": "you@yourcompany.com",
  "subject": "Mandatory password reset",
  "date": "2026-03-15T09:14:00Z",
  "headerIndicators": { "from": "ind-lookalike-domain" },
  "indicators": [
    {
      "id": "ind-lookalike-domain",
      "type": "Lookalike internal domain",
      "explanation": "Real IT uses yourcompany.com, NOT yourcompany-it.co."
    }
  ],
  "bodyHtml": "<p>Hi,</p><p>Please reset your password by <a data-indicator='ind-link'>clicking here</a> within 24 hours.</p>"
}
```

The HTML uses `data-indicator="..."` attributes that the engine recognises as clickable regions.

## Submission checklist (CodeAlpha)

- [x] Source code uploaded to GitHub as `CodeAlpha_PhishGuard`
- [x] README explains setup, usage, and the educational angle
- [ ] LinkedIn post tagging **@CodeAlpha** with the GitHub link and a short demo video
- [ ] Submission form filled out

## License

MIT — see [LICENSE](LICENSE).

## Ethics & disclaimer

All "phishing" emails in this app are **synthetic samples** for education only. They imitate the patterns of real attacks but reference no real victims or campaigns. Do not reuse these templates to send unsolicited mail — that is illegal in most jurisdictions and not the point of the project.

---

#CodeAlpha · Task 2 · Cyber Security Internship
