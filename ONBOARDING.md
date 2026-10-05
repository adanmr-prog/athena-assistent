# Welcome to AthenaSchool

## How We Use Claude

Based on Claude's usage over the last 30 days:

Work Type Breakdown:
  Write Docs      ████████████████████  100%
  Build Feature   ░░░░░░░░░░░░░░░░░░░░    0%
  Plan Design     ░░░░░░░░░░░░░░░░░░░░    0%

Top Skills & Commands:
  _No slash commands used yet. The repo ships `/release` and the skill `athena-backend-api` (see below)._

Top MCP Servers:
  Claude_Docs    ████████████████████  24 calls
  Google_Drive   ███████░░░░░░░░░░░░░   8 calls
  Gmail          ██░░░░░░░░░░░░░░░░░░   2 calls
  Notion         █░░░░░░░░░░░░░░░░░░░   1 call

## Your Setup Checklist

### Codebases
- [ ] athena-assistent — https://github.com/adanmr-prog/athena-assistent (werk-PWA van AthenaSchool: `index.html`, `sw.js`, `backend/Code.gs`; lees `CLAUDE.md` eerst)

### MCP Servers to Activate
- [ ] Claude_Docs — living documents (onboardingprogramma's, plannen, rapporten) die je deelt en waar collega's op reageren. Standaard beschikbaar in Claude Code; geen extra setup.
- [ ] Google_Drive — zoeken en lezen in de AthenaSchool-Drive (OC-drive, Recruitment & Onboarding, voorstellen, strategiedocumenten). Koppel je Google-werkaccount via claude.ai → Settings → Connectors.
- [ ] Gmail — mailthreads met scholen en collega's opzoeken en beantwoorden. Zelfde Google-koppeling als Drive.
- [ ] Notion — de Pallas Athena Group-workspace (teamdoelen, notities). Koppel Notion via claude.ai → Settings → Connectors.

### Skills to Know About
- /release — nieuwe versie van de PWA uitbrengen: `CACHE` in `sw.js` bumpen, versiecommentaar, commit-titel `vX.Y: omschrijving`.
- athena-backend-api — contract van de Apps Script-backend (`run()`-RPC, api*-functies, Sheet-tabbladen). Laadt automatisch bij wijzigingen aan data-ophalen in `index.html` of `backend/Code.gs`.
- ios-pwa-reviewer (subagent) — laat elke wijziging aan layout, caching of navigatie hierdoor reviewen voor iOS Safari-valkuilen.
- voorstel-huisstijl — samenwerkingsvoorstellen voor scholen in de exacte AthenaSchool-huisstijl, als .docx in Drive.

## Team Tips

_TODO_

## Get Started

_TODO_

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
