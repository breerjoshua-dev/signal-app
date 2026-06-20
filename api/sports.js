export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const LEAGUES = [
    { sport: 'football',   league: 'nfl',            label: 'NFL' },
    { sport: 'basketball', league: 'nba',            label: 'NBA' },
    { sport: 'baseball',   league: 'mlb',            label: 'MLB' },
    { sport: 'soccer',     league: 'usa.1',          label: 'MLS' },
    { sport: 'soccer',     league: 'eng.1',          label: 'Premier League' },
    { sport: 'soccer',     league: 'uefa.champions', label: 'Champions League' },
    { sport: 'soccer',     league: 'esp.1',          label: 'La Liga' },
    { sport: 'soccer',     league: 'fifa.world',     label: 'World Cup' },
  ];

  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const allGames = [];

  await Promise.allSettled(LEAGUES.map(async ({ sport, league, label }) => {
    try {
      const r = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`,
        { headers: { 'User-Agent': 'Signal/1.0' } }
      );
      if (!r.ok) return;
      const d = await r.json();
      for (const event of (d.events || [])) {
        const comp = event.competitions?.[0];
        if (!comp) continue;
        const date = new Date(event.date).getTime();
        if (date < cutoff) continue;

        const status = comp.status?.type;
        const state  = status?.state;
        const detail = status?.shortDetail || '';
        const home   = comp.competitors?.find(c => c.homeAway === 'home');
        const away   = comp.competitors?.find(c => c.homeAway === 'away');
        if (!home || !away) continue;

        allGames.push({
          league,
          leagueLabel: label,
          state,
          detail,
          home: { name: home.team?.shortDisplayName || home.team?.displayName, score: home.score || '0' },
          away: { name: away.team?.shortDisplayName || away.team?.displayName, score: away.score || '0' },
          date: event.date,
        });
      }
    } catch (_) {}
  }));

  // Sort: live first, then recent post, then upcoming by time
  const stateOrder = { in: 0, post: 1, pre: 2 };
  allGames.sort((a, b) => {
    const ao = stateOrder[a.state] ?? 3, bo = stateOrder[b.state] ?? 3;
    if (ao !== bo) return ao - bo;
    return new Date(b.date) - new Date(a.date);
  });

  // Curate: max 2 per league, max 4 total
  const leagueCount = {};
  const curated = [];
  for (const g of allGames) {
    if (curated.length >= 4) break;
    const count = leagueCount[g.league] || 0;
    if (count >= 2) continue;
    leagueCount[g.league] = count + 1;
    curated.push(g);
  }

  return res.status(200).json({ games: curated });
}
