// Local dashboard (Stage 1) — a zero-dependency localhost server rendering
// the skill profile and counters live. Binds 127.0.0.1 ONLY; serves read-only
// local data; nothing leaves the machine.

import * as http from 'node:http';
import * as state from './state.ts';
import * as configLib from './config.ts';
import * as skills from './skills.ts';

export function createDashboardServer(): http.Server {
  return http.createServer((req, res) => {
    try {
      if (req.url === '/data') {
        const runtime = state.loadRuntimeState();
        const config = configLib.effective(configLib.loadConfig({}), runtime);
        const profile = state.loadProfile();
        const skillRows = Object.entries(profile.skills ?? {})
          .filter(([, s]) => s && s.reps > 0)
          .map(([name, s]) => ({
            name,
            proficiency: Math.round(skills.decayedProficiency(profile, name)),
            reps: s.reps,
            independent_reps: s.independent_reps,
            graduated: skills.graduated(profile, name),
          }))
          .sort((a, b) => b.proficiency - a.proficiency);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            generated_at: new Date().toISOString(),
            hone: {
              enabled: config.hone.enabled,
              hint_level: config.hone.hint_level,
              learning_budget: config.hone.learning_budget,
            },
            counters: profile.counters,
            categories: profile.categories,
            skills: skillRows,
            hint_history: (profile.hint_history ?? []).slice(-50),
          }),
        );
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end(String(err));
    }
  });
}

// Self-contained page; polls /data every 5s. Styled for light and dark.
const PAGE = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hone</title>
<style>
  :root { color-scheme: light dark; --fg: #1a1a1a; --muted: #6b6b6b; --bar: #4a7dbd; --bg-bar: #00000014; --card: #00000008; }
  @media (prefers-color-scheme: dark) { :root { --fg: #e8e8e8; --muted: #9a9a9a; --bar: #6ba3e8; --bg-bar: #ffffff1a; --card: #ffffff0d; } }
  body { font: 15px/1.5 system-ui, sans-serif; color: var(--fg); max-width: 640px; margin: 3rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; } h1 span { color: var(--muted); font-weight: normal; font-size: 0.9rem; }
  .cards { display: flex; gap: .75rem; flex-wrap: wrap; margin: 1rem 0; }
  .card { background: var(--card); border-radius: 8px; padding: .6rem 1rem; }
  .card b { display: block; font-size: 1.3rem; } .card i { font-style: normal; color: var(--muted); font-size: .8rem; }
  .skill { margin: .6rem 0; } .skill .row { display: flex; justify-content: space-between; font-size: .9rem; }
  .skill .track { height: 8px; border-radius: 4px; background: var(--bg-bar); overflow: hidden; margin-top: 4px; }
  .skill .fill { height: 100%; border-radius: 4px; background: var(--bar); transition: width .4s; }
  .grad { color: var(--muted); font-size: .8rem; }
  .note { color: var(--muted); font-size: .8rem; margin-top: 2rem; }
</style>
</head>
<body>
<h1>⬡ Hone <span id="meta"></span></h1>
<div class="cards" id="cards"></div>
<div id="skills"></div>
<p class="note">Proficiency is a directional behavioral signal — how you engage coaching — not a graded test score. All data is local (<code>~/.claude/hone/</code>).</p>
<script>
// profile.json is hand-editable — escape anything from it before it touches
// innerHTML so a crafted category name can't inject markup.
function esc(v) {
  return String(v).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
async function refresh() {
  try {
    const d = await (await fetch('/data')).json();
    document.getElementById('meta').textContent =
      (d.hone.enabled ? 'on' : 'off') + ' · hint ' + d.hone.hint_level + ' · budget ' + d.hone.learning_budget + '%';
    const c = d.counters || {};
    document.getElementById('cards').innerHTML = [
      ['coached', (c.coached||0) + '/' + (c.eligible||0)],
      ['gates answered', c.gates_answered||0],
      ['skipped', c.skipped||0],
      ['reflections', c.reflections||0],
      ['interviews', c.interviews||0],
      ['corrections', c.corrections||0],
    ].map(([k,v]) => '<div class="card"><b>'+esc(v)+'</b><i>'+esc(k)+'</i></div>').join('');
    document.getElementById('skills').innerHTML = (d.skills||[]).map(s => {
      const pct = Math.min(100, Math.max(0, Number(s.proficiency) || 0));
      return '<div class="skill"><div class="row"><span>'+esc(s.name)+(s.graduated?' <span class="grad">🎓 graduated</span>':'')+'</span>'+
      '<span>'+pct+' · '+esc(s.independent_reps)+' indep / '+esc(s.reps)+' reps</span></div>'+
      '<div class="track"><div class="fill" style="width:'+pct+'%"></div></div></div>';
    }).join('') || '<p class="grad">No coached tasks yet — the profile builds as you engage gates.</p>';
  } catch {}
}
refresh(); setInterval(refresh, 5000);
</script>
</body>
</html>
`;
