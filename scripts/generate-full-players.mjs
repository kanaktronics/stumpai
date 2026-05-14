import fs from 'fs';

const fullData = JSON.parse(fs.readFileSync('players_computed_full.json', 'utf8'));

// ── 50+ Binary Fingerprints ────────────────────────────────────────────────
function computeFingerprint(p) {
  const wpm = p.matches > 0 ? p.wickets / p.matches : 0;
  const rpm = p.matches > 0 ? p.runs    / p.matches : 0;
  const years = p.seasons.map(s => parseInt(s));
  const econ  = p.economy ?? 99;
  const sr    = p.strike_rate ?? 0;
  const teams = p.teams || [];
  const allTeams = t => teams.some(x => x.startsWith(t));
  const primary = teams[0] || '';
  const wicketsPerMatch = wpm;
  const hasFiveWkt = (p.best_bowling && parseInt(p.best_bowling) >= 5)
    || (wicketsPerMatch >= 2.0 && p.wickets >= 5)
    || (p.wickets >= 5 && p.matches <= 10);
  return {
    // Batting volume
    centuries         : p.centuries > 0,
    fifties           : (p.fifties ?? 0) > 0,
    highScoreAbove75  : (p.highest_score ?? 0) > 75,
    runsAbove500      : p.runs > 500,
    runsAbove2000     : p.runs > 2000,
    runsAbove4000     : p.runs > 4000,
    matchesAbove50    : p.matches > 50,
    matchesAbove100   : p.matches > 100,
    matchesAbove150   : p.matches > 150,
    // Batting tempo
    strikeRateAbove150: sr > 150,
    strikeRateAbove130: sr > 130,
    strikeRateAbove110: sr > 110,
    sixesAbove50      : (p.sixes ?? 0) > 50,
    sixesAbove100     : (p.sixes ?? 0) > 100,
    avgRunsPerMatchAbove25: rpm > 25,
    avgRunsPerMatchAbove15: rpm > 15,
    // Bowling
    fiveWickets       : hasFiveWkt,
    wicketsAbove50    : p.wickets > 50,
    wicketsAbove100   : p.wickets > 100,
    wicketsAbove150   : p.wickets > 150,
    potmAbove3        : (p.potm ?? 0) > 3,
    potmAbove10       : (p.potm ?? 0) > 10,
    // Economy
    economyBelow7     : p.wickets > 0 && econ < 7,
    economyBelow8     : p.wickets > 0 && econ < 8,
    economyBelow9     : p.wickets > 0 && econ < 9,
    // Career span
    retiredFromIPL    : !p.is_active,
    playedBefore2012  : years.some(y => y <= 2011),
    playedAfter2018   : years.some(y => y >= 2019),
    multipleTeams     : teams.length >= 3,
    singleTeamLoyal   : teams.length === 1,
    playedSeasons3plus: p.seasons.length >= 3,
    playedSeasons7plus: p.seasons.length >= 7,
    playedSeasons10plus: p.seasons.length >= 10,
    // Franchise fingerprints
    primaryTeamMI  : primary === 'MI',
    primaryTeamCSK : primary === 'CSK',
    primaryTeamRCB : primary === 'RCB',
    primaryTeamKKR : primary === 'KKR',
    primaryTeamRR  : primary === 'RR',
    primaryTeamSRH : primary === 'SRH' || primary === 'DC_old',
    primaryTeamDC  : primary === 'DC' || primary === 'DD',
    primaryTeamPBKS: primary === 'PBKS' || primary === 'KXIP',
    everPlayedMI   : allTeams('MI'),
    everPlayedCSK  : allTeams('CSK'),
    everPlayedRCB  : allTeams('RCB'),
    everPlayedKKR  : allTeams('KKR'),
    everPlayedRR   : allTeams('RR'),
    everPlayedSRH  : allTeams('SRH') || allTeams('DC_old'),
  };
}

function computeCluster(p, role, fp) {
  const teams = p.teams || [];
  const primary = teams[0] || '';
  if (role === 'wicketkeeper') return 'wicketkeeper-batter';
  const isOverseas = (p.country ?? 'India') !== 'India';
  if (primary === 'MI' && (role === 'bowler' || p.economy < 8)) return 'mi-death-bowler';
  if ((primary === 'CSK' || primary === 'RPS') && !isOverseas) return 'csk-legend';
  if (primary === 'RCB' && isOverseas) return 'rcb-overseas-hitter';
  if ((primary === 'KKR' || primary === 'SRH') && role === 'bowler' && p.economy < 7.5) return 'kkr-mystery-spinner';
  if (primary === 'SRH' && role === 'bowler') return 'srh-run-miser';
  if (primary === 'RR' && fp.singleTeamLoyal && fp.playedBefore2012) return 'rr-one-season-wonder';
  if (isOverseas && (role === 'batsman' || role === 'allrounder') && fp.strikeRateAbove130) return 'overseas-power-hitter';
  if (isOverseas && role === 'bowler' && p.economy < 7.5) return 'overseas-spinner';
  if (!isOverseas && (role === 'batsman') && fp.runsAbove2000 && fp.strikeRateAbove110) return 'indian-opener';
  if (!isOverseas && role === 'bowler') return 'indian-fast-bowler';
  if (role === 'allrounder') return 'domestic-allrounder';
  if (fp.matchesAbove50 && fp.avgRunsPerMatchAbove15 && !isOverseas) return 'indian-anchor';
  if (p.matches < 15 && (p.potm ?? 0) >= 2) return 'uncapped-gem';
  return 'utility-player';
}

// ── Compute IPL Era ──────────────────────────────────────────────────────────
function getEra(seasons) {
  const years = seasons.map(s => parseInt(s));
  const firstYear = Math.min(...years);
  if (firstYear <= 2011) return 'early';
  if (firstYear <= 2018) return 'golden';
  return 'modern';
}

// ── Auto-derive Identity DNA from raw stats ─────────────────────────────────
function computeIdentityDNA(p) {
  const totalBalls = p.balls_faced || 1;
  const totalBowled = p.balls_bowled || 1;
  const matchShare = Math.min(p.matches / 50, 1.0); // normalized to 50 match "veteran"

  // Batting identity
  const srNorm = Math.min((p.strike_rate || 0) / 200, 1.0);
  const sixRate = p.balls_faced > 0 ? Math.min(p.sixes / (p.balls_faced / 6), 1.0) : 0;
  const avgRuns = p.matches > 0 ? p.runs / p.matches : 0;
  const isConsistentBatter = avgRuns > 20;

  // Bowling identity
  const wicketsPerMatch = p.matches > 0 ? p.wickets / p.matches : 0;
  const econNorm = p.economy ? Math.max(0, 1 - (p.economy - 5) / 5) : 0;

  // Determine primary batting identity
  const powerHitter = Math.min(srNorm * 0.6 + sixRate * 0.4, 1.0);
  const finisher = p.potm > 2 && p.runs > 100 ? Math.min(p.potm / 10 + srNorm * 0.3, 1.0) : srNorm * 0.3;
  const anchor = isConsistentBatter && p.strike_rate < 130 ? 0.8 : (isConsistentBatter ? 0.5 : 0.1);
  const strokeMaker = isConsistentBatter && p.strike_rate > 120 && p.strike_rate < 150 ? 0.7 : 0.2;
  const opener = p.seasons.length > 0 && p.runs > 300 && !p.wickets ? 0.6 : 0.2;

  // Bowling identity
  const deathBowler = wicketsPerMatch > 1.0 ? 0.8 : wicketsPerMatch > 0.5 ? 0.5 : 0.1;
  const spinWizard = p.wickets > 10 && p.economy && p.economy < 7.5 ? 0.7 : 0.2;
  const paceAggressor = p.wickets > 10 && p.economy && p.economy >= 7.5 ? 0.7 : 0.2;
  const economySpecialist = econNorm * (p.wickets > 5 ? 1 : 0.3);

  // Personality/perception
  const clutchPlayer = p.potm > 3 ? Math.min(p.potm / 15, 1.0) : p.potm / 10;
  const captainAura = 0.1; // will be overridden by SPECIAL_METADATA for known captains
  const memeFactor = (p.potm > 5 || p.centuries > 0 || p.highest_score > 90) ? 0.7 : 0.2;
  const fanbaseIntensity = matchShare * 0.5 + clutchPlayer * 0.5;
  const underdog = p.matches < 15 && p.potm > 1 ? 0.8 : 0.1;

  // Career arc
  const longevity = Math.min(p.seasons.length / 10, 1.0);
  const oneSeasonWonder = p.seasons.length <= 2 && p.potm >= 2 ? 0.9 : 0.1;
  const consistent = p.seasons.length >= 5 && isConsistentBatter ? 0.8 : 0.3;

  return {
    finisher: parseFloat(finisher.toFixed(2)),
    anchor: parseFloat(anchor.toFixed(2)),
    powerHitter: parseFloat(powerHitter.toFixed(2)),
    strokeMaker: parseFloat(strokeMaker.toFixed(2)),
    opener: parseFloat(opener.toFixed(2)),
    deathBowler: parseFloat(deathBowler.toFixed(2)),
    spinWizard: parseFloat(spinWizard.toFixed(2)),
    paceAggressor: parseFloat(paceAggressor.toFixed(2)),
    economySpecialist: parseFloat(economySpecialist.toFixed(2)),
    clutchPlayer: parseFloat(clutchPlayer.toFixed(2)),
    captainAura: parseFloat(captainAura.toFixed(2)),
    memeFactor: parseFloat(memeFactor.toFixed(2)),
    fanbaseIntensity: parseFloat(fanbaseIntensity.toFixed(2)),
    underdog: parseFloat(underdog.toFixed(2)),
    longevity: parseFloat(longevity.toFixed(2)),
    oneSeasonWonder: parseFloat(oneSeasonWonder.toFixed(2)),
    consistent: parseFloat(consistent.toFixed(2)),
  };
}

// ── Auto-derive identity tags from stats ─────────────────────────────────────
function computeIdentityTags(p, dna) {
  const tags = [];
  if (p.teams.length === 1) tags.push(`${p.teams[0]} loyalist`);
  if (p.potm > 5) tags.push('match-winner');
  if (dna.powerHitter > 0.7) tags.push('brutal six hitter');
  if (dna.finisher > 0.6) tags.push('death overs match finisher');
  if (dna.economySpecialist > 0.6) tags.push('run-miser bowler');
  if (dna.deathBowler > 0.7) tags.push('death over specialist');
  if (dna.oneSeasonWonder > 0.7) tags.push('one-season wonder');
  if (dna.underdog > 0.7) tags.push('underdog hero');
  if (p.centuries > 0) tags.push('IPL centurion');
  if (p.potm > 3 && p.matches < 20) tags.push('high-impact short career');
  if (p.seasons.length >= 8) tags.push('IPL stalwart');
  return tags;
}

// ── Auto-derive Aura Embedding from Identity DNA ───────────────────────────
function computeAura(dna) {
  return {
    // Composed = anchor + clutch + consistent (not explosive)
    composed: parseFloat(Math.min((dna.anchor * 0.4 + dna.clutchPlayer * 0.4 + dna.consistent * 0.2), 1.0).toFixed(2)),
    // Aggressive = pace aggressor + power hitter
    aggressive: parseFloat(Math.min((dna.paceAggressor * 0.5 + dna.powerHitter * 0.5), 1.0).toFixed(2)),
    // Explosive = power hitter + finisher + low anchor
    explosive: parseFloat(Math.min((dna.powerHitter * 0.5 + dna.finisher * 0.3 + (1 - dna.anchor) * 0.2), 1.0).toFixed(2)),
    // Innovative = spin wizard + stroke maker (unexpected angles)
    innovative: parseFloat(Math.min((dna.spinWizard * 0.5 + dna.strokeMaker * 0.5), 1.0).toFixed(2)),
    // Captain-like = captain aura + clutch + longevity
    captainLike: parseFloat(Math.min((dna.captainAura * 0.6 + dna.clutchPlayer * 0.2 + dna.longevity * 0.2), 1.0).toFixed(2)),
    // Silent killer = underdog + clutch + low meme factor
    silentKiller: parseFloat(Math.min((dna.underdog * 0.4 + dna.clutchPlayer * 0.4 + (1 - dna.memeFactor) * 0.2), 1.0).toFixed(2)),
  };
}


// ── High-quality manual overrides for legends ────────────────────────────────
// Also includes AURA OVERRIDES so key players are radically separable
const SPECIAL_METADATA = {
  'ms-dhoni': {
    identityDNA: { finisher:0.99, anchor:0.5, powerHitter:0.6, strokeMaker:0.4, opener:0.0, deathBowler:0.0, spinWizard:0.0, paceAggressor:0.0, economySpecialist:0.0, clutchPlayer:0.99, captainAura:0.99, memeFactor:0.99, fanbaseIntensity:0.99, underdog:0.0, longevity:0.95, oneSeasonWonder:0.0, consistent:0.95 },
    identityTags: ['CSK legend', 'finisher of finishers', 'helicopter shot', 'calm under pressure', 'greatest IPL captain', 'stumping wizard'],
    aura: { composed:0.99, aggressive:0.3, explosive:0.6, innovative:0.7, captainLike:0.99, silentKiller:0.2 },
    era: 'early',
  },
  'virat-kohli': {
    identityDNA: { finisher:0.4, anchor:0.7, powerHitter:0.5, strokeMaker:0.9, opener:0.7, deathBowler:0.0, spinWizard:0.0, paceAggressor:0.0, economySpecialist:0.0, clutchPlayer:0.85, captainAura:0.8, memeFactor:0.99, fanbaseIntensity:0.99, underdog:0.0, longevity:0.99, oneSeasonWonder:0.0, consistent:0.99 },
    identityTags: ['RCB icon', 'orange cap machine', '973 runs in a season', 'run chasing genius', 'most passionate fan favorite'],
    aura: { composed:0.7, aggressive:0.8, explosive:0.6, innovative:0.4, captainLike:0.8, silentKiller:0.1 },
    era: 'early',
  },
  'rohit-sharma': {
    identityDNA: { finisher:0.5, anchor:0.6, powerHitter:0.7, strokeMaker:0.85, opener:0.9, deathBowler:0.0, spinWizard:0.0, paceAggressor:0.0, economySpecialist:0.0, clutchPlayer:0.8, captainAura:0.9, memeFactor:0.9, fanbaseIntensity:0.95, underdog:0.0, longevity:0.99, oneSeasonWonder:0.0, consistent:0.9 },
    identityTags: ['MI captain', '5 IPL titles', 'hitman', 'elegant opener', 'best IPL captain record'],
    aura: { composed:0.85, aggressive:0.5, explosive:0.7, innovative:0.5, captainLike:0.9, silentKiller:0.1 },
    era: 'early',
  },
  'lasith-malinga': {
    identityDNA: { finisher:0.0, anchor:0.0, powerHitter:0.0, strokeMaker:0.0, opener:0.0, deathBowler:0.99, spinWizard:0.0, paceAggressor:0.9, economySpecialist:0.6, clutchPlayer:0.9, captainAura:0.1, memeFactor:0.9, fanbaseIntensity:0.9, underdog:0.0, longevity:0.7, oneSeasonWonder:0.0, consistent:0.85 },
    identityTags: ['Slinga Malinga', 'yorker machine', 'death over assassin', 'MI bowling legend', 'most feared T20 bowler'],
    aura: { composed:0.5, aggressive:0.9, explosive:0.3, innovative:0.95, captainLike:0.1, silentKiller:0.7 },
    era: 'early',
  },
  'ab-devilliers': {
    identityDNA: { finisher:0.9, anchor:0.4, powerHitter:0.95, strokeMaker:0.95, opener:0.3, deathBowler:0.0, spinWizard:0.0, paceAggressor:0.0, economySpecialist:0.0, clutchPlayer:0.95, captainAura:0.5, memeFactor:0.99, fanbaseIntensity:0.99, underdog:0.0, longevity:0.7, oneSeasonWonder:0.0, consistent:0.9 },
    identityTags: ['Mr.360', 'RCB superhero', 'played every shot ever', 'fastest IPL fifty', 'fans choice player'],
    aura: { composed:0.6, aggressive:0.6, explosive:0.95, innovative:0.99, captainLike:0.5, silentKiller:0.2 },
    era: 'golden',
  },
  'jasprit-bumrah': {
    identityDNA: { finisher:0.0, anchor:0.0, powerHitter:0.0, strokeMaker:0.0, opener:0.0, deathBowler:0.99, spinWizard:0.0, paceAggressor:0.95, economySpecialist:0.95, clutchPlayer:0.95, captainAura:0.5, memeFactor:0.85, fanbaseIntensity:0.9, underdog:0.0, longevity:0.7, oneSeasonWonder:0.0, consistent:0.98 },
    identityTags: ['no-look yorker', 'death over god', 'MI pace attack', 'unplayable action', 'India pace spearhead'],
    aura: { composed:0.8, aggressive:0.85, explosive:0.3, innovative:0.95, captainLike:0.5, silentKiller:0.9 },
    era: 'golden',
  },
  'suresh-raina': {
    identityDNA: { finisher:0.7, anchor:0.6, powerHitter:0.6, strokeMaker:0.7, opener:0.2, deathBowler:0.0, spinWizard:0.3, paceAggressor:0.0, economySpecialist:0.3, clutchPlayer:0.85, captainAura:0.4, memeFactor:0.85, fanbaseIntensity:0.85, underdog:0.0, longevity:0.9, oneSeasonWonder:0.0, consistent:0.85 },
    identityTags: ['Mr.IPL', 'first IPL century', 'CSK heartbeat', 'cover drive king', 'short ball weakness notorious'],
    aura: { composed:0.5, aggressive:0.5, explosive:0.6, innovative:0.4, captainLike:0.4, silentKiller:0.3 },
    era: 'early',
  },
  'chris-gayle': {
    identityDNA: { finisher:0.4, anchor:0.2, powerHitter:0.99, strokeMaker:0.5, opener:0.99, deathBowler:0.0, spinWizard:0.4, paceAggressor:0.0, economySpecialist:0.0, clutchPlayer:0.7, captainAura:0.5, memeFactor:0.99, fanbaseIntensity:0.99, underdog:0.0, longevity:0.7, oneSeasonWonder:0.0, consistent:0.7 },
    identityTags: ['Universe Boss', '175 the highest IPL score', 'six hitting machine', 'crowd entertainer', 'Gayle storm'],
    aura: { composed:0.3, aggressive:0.8, explosive:0.99, innovative:0.5, captainLike:0.5, silentKiller:0.0 },
    era: 'early',
  },
  // Sohail Tanvir — the hard one
  '64d43928': {
    country: 'Pakistan',
    isOverseas: true,
    isIndian: false,
    identityDNA: { finisher:0.2, anchor:0.0, powerHitter:0.1, strokeMaker:0.0, opener:0.0, deathBowler:0.8, spinWizard:0.0, paceAggressor:0.8, economySpecialist:0.7, clutchPlayer:0.9, captainAura:0.1, memeFactor:0.8, fanbaseIntensity:0.6, underdog:0.7, longevity:0.1, oneSeasonWonder:0.95, consistent:0.1 },
    identityTags: ['Pakistan pacer', '2008 inaugural champion', 'Warne secret weapon', '6-wicket haul holder', 'one-season wonder', 'RR legend 2008'],
    aura: { composed:0.4, aggressive:0.8, explosive:0.2, innovative:0.5, captainLike:0.1, silentKiller:0.8 },
    era: 'early',
  },
};

const LEGENDS = [
  { id:'ms-dhoni', name:'MS Dhoni', role:'wicketkeeper', battingStyle:'right', bowlingStyle:'none', country:'India', isIndian:true, isOverseas:false, teams:['CSK','RPS'], activeYears:[2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024], titles:5, orangeCap:false, purpleCap:false, under19WorldCup:false, internationalCaptain:true, iplCaptain:true, centuries:false, fiveWickets:false, strikeRateAbove150:true, economyBelow7:false, retiredFromIPL:false, famousFor:'Finisher, helicopter shot, greatest IPL captain', signatureFeat: 'Most matches as captain ever' },
  { id:'virat-kohli', name:'Virat Kohli', role:'batsman', battingStyle:'right', bowlingStyle:'none', country:'India', isIndian:true, isOverseas:false, teams:['RCB'], activeYears:[2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024], titles:0, orangeCap:true, purpleCap:false, under19WorldCup:true, internationalCaptain:true, iplCaptain:true, centuries:true, fiveWickets:false, strikeRateAbove150:false, economyBelow7:false, retiredFromIPL:false, famousFor:'RCB icon, 973 runs in a single season, 3 Orange Caps', signatureFeat: '973 runs in a single season — never matched' },
  { id:'rohit-sharma', name:'Rohit Sharma', role:'batsman', battingStyle:'right', bowlingStyle:'right-spin', country:'India', isIndian:true, isOverseas:false, teams:['DC','MI'], activeYears:[2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024], titles:5, orangeCap:false, purpleCap:false, under19WorldCup:false, internationalCaptain:true, iplCaptain:true, centuries:true, fiveWickets:false, strikeRateAbove150:true, economyBelow7:false, retiredFromIPL:false, famousFor:'Hitman, MI captain, 5 IPL titles', signatureFeat: '5 IPL titles as captain — most ever' },
  { id:'ab-devilliers', name:'AB de Villiers', role:'batsman', battingStyle:'right', bowlingStyle:'none', country:'South Africa', isIndian:false, isOverseas:true, teams:['DD','RCB'], activeYears:[2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], titles:0, orangeCap:false, purpleCap:false, under19WorldCup:false, internationalCaptain:true, iplCaptain:false, centuries:true, fiveWickets:false, strikeRateAbove150:true, economyBelow7:false, retiredFromIPL:true, famousFor:'Mr.360, RCB superhero, fastest IPL 50', signatureFeat: 'The only player who can play every shot in the book' },
  { id:'lasith-malinga', name:'Lasith Malinga', role:'bowler', battingStyle:'right', bowlingStyle:'right-fast', country:'Sri Lanka', isIndian:false, isOverseas:true, teams:['MI'], activeYears:[2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019], titles:4, orangeCap:false, purpleCap:true, under19WorldCup:false, internationalCaptain:false, iplCaptain:false, centuries:false, fiveWickets:true, strikeRateAbove150:false, economyBelow7:false, retiredFromIPL:true, famousFor:'Slinga Malinga, yorker machine, death over assassin', signatureFeat: 'Unorthodox slingy action — most feared death bowler ever' },
  { id:'suresh-raina', name:'Suresh Raina', role:'batsman', battingStyle:'left', bowlingStyle:'right-spin', country:'India', isIndian:true, isOverseas:false, teams:['CSK','GL'], activeYears:[2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021], titles:3, orangeCap:false, purpleCap:false, under19WorldCup:false, internationalCaptain:false, iplCaptain:false, centuries:true, fiveWickets:false, strikeRateAbove150:false, economyBelow7:false, retiredFromIPL:true, famousFor:'Mr.IPL, first IPL century, cover drive king', signatureFeat: 'Scored in 16 consecutive IPL seasons — Mr. IPL' },
  { id:'chris-gayle', name:'Chris Gayle', role:'batsman', battingStyle:'left', bowlingStyle:'right-spin', country:'West Indies', isIndian:false, isOverseas:true, teams:['KKR','RCB','PBKS'], activeYears:[2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019], titles:0, orangeCap:false, purpleCap:false, under19WorldCup:false, internationalCaptain:true, iplCaptain:false, centuries:true, fiveWickets:false, strikeRateAbove150:true, economyBelow7:false, retiredFromIPL:true, famousFor:'Universe Boss, 175* highest IPL score, Gayle Storm', signatureFeat: '175* — the highest individual score in IPL history' },
  { id:'jasprit-bumrah', name:'Jasprit Bumrah', role:'bowler', battingStyle:'right', bowlingStyle:'right-fast', country:'India', isIndian:true, isOverseas:false, teams:['MI'], activeYears:[2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024], titles:4, orangeCap:false, purpleCap:true, under19WorldCup:false, internationalCaptain:true, iplCaptain:false, centuries:false, fiveWickets:true, strikeRateAbove150:false, economyBelow7:true, retiredFromIPL:false, famousFor:'No-look yorker, death over god, unplayable action', signatureFeat: 'The no-look yorker — technically unplayable delivery' },
];

const legendIds = new Set(LEGENDS.map(l => l.id));
const legendNames = new Set(LEGENDS.map(l => l.name.toLowerCase()));
const finalPlayers = [];

// Apply SPECIAL_METADATA to legends
for (const legend of LEGENDS) {
  const override = SPECIAL_METADATA[legend.id] || {};
  const rawProxy = { matches:100, runs:3000, wickets:0, strike_rate:140, sixes:150, balls_faced:2000, balls_bowled:0, economy:0, potm:15, centuries:3, fifties:20, highest_score:130, seasons:['2008','2009','2010','2011','2012'], is_active:true, teams:legend.teams, country:legend.country };
  const dna = override.identityDNA || computeIdentityDNA(rawProxy);
  const tags = override.identityTags || computeIdentityTags(legend, dna);
  const auraEmbedding = override.aura || computeAura(dna);
  const era = override.era || getEra(legend.activeYears.map(y => String(y)));
  const fp = computeFingerprint({ ...rawProxy, ...legend, seasons: legend.activeYears.map(String), wickets: legend.role === 'bowler' ? 150 : 0 });
  const cluster = computeCluster(rawProxy, legend.role, fp);
  finalPlayers.push({ ...legend, cluster, ...fp, identityDNA: dna, identityTags: tags, auraEmbedding, era });
}

// Process all other players
for (const p of fullData) {
  if (legendIds.has(p.id) || legendNames.has(p.name.toLowerCase())) continue;

  const override = SPECIAL_METADATA[p.id] || {};
  const country = override.country || 'India';
  // Role: needs at least 15 wickets + 300 runs for allrounder, 10+ wickets for bowler
  const role = (p.wickets > 15 && p.runs > 300) ? 'allrounder'
             : (p.wickets > 10) ? 'bowler'
             : 'batsman';
  const years = p.seasons.map(s => parseInt(s));
  if (p.seasons.includes('2007/08') && !years.includes(2008)) years.push(2008);

  const dna = override.identityDNA || computeIdentityDNA(p);
  const tags = override.identityTags || computeIdentityTags(p, dna);
  const auraEmbedding = override.aura || computeAura(dna);
  const era = getEra(p.seasons);

  let signatureFeat = null;
  if (p.potm > 10) signatureFeat = 'Player of the Match Titan';
  else if (p.centuries >= 5) signatureFeat = 'Centurion Legend';
  else if (p.wickets > 150) signatureFeat = 'Wicket-taking Machine';
  else if (p.strike_rate > 180 && p.runs > 500) signatureFeat = 'Hard-hitting Specialist';
  else if (p.potm >= 3 && p.matches < 20) signatureFeat = 'Impactful One-Season Legend';

  // ── Bowling style: use economy as a heuristic for pace vs spin.
  // Economy >= 8 → typically pace (higher risk/reward). Economy < 8 → likely spin/medium.
  // Players with no wickets get 'none'.
  let bowlingStyle = 'none';
  if (p.wickets > 0) {
    const econ = p.economy ?? 8.5;
    if (econ >= 8.0) {
      bowlingStyle = 'right-fast';    // high economy = pace bowler
    } else if (econ >= 6.5) {
      bowlingStyle = 'right-medium';  // medium pace / swing bowlers
    } else {
      bowlingStyle = 'right-spin';    // low economy = spin
    }
  }

  // ── Batting style: default right, can be overridden by SPECIAL_METADATA.
  const battingStyle = override.battingStyle || 'right';

  // ── Five-wicket haul: use `p.best_bowling` if available, else proxy:
  // A player with 5+ wickets AND matches < 10 likely had a standout spell.
  // Also flag players with very low economy + high wicket ratio.
  const wicketsPerMatch = p.matches > 0 ? p.wickets / p.matches : 0;
  const hasFiveWicketHaul = (p.best_bowling && parseInt(p.best_bowling) >= 5)
    || (p.wickets >= 5 && p.matches <= 10)  // small sample standout
    || (wicketsPerMatch >= 2.0 && p.wickets >= 5); // elite bowling rate

  const fp = computeFingerprint(p);
  const cluster = computeCluster(p, role, fp);
  finalPlayers.push({
    id: p.id,
    name: p.name,
    role,
    battingStyle,
    bowlingStyle,
    country,
    isIndian  : override.isIndian   !== undefined ? override.isIndian   : country === 'India',
    isOverseas: override.isOverseas !== undefined ? override.isOverseas : country !== 'India',
    teams: p.teams,
    activeYears: years,
    era,
    cluster,
    titles               : 0,
    orangeCap            : false,
    purpleCap            : false,
    under19WorldCup      : false,
    internationalCaptain : false,
    iplCaptain           : false,
    ...fp,
    famousFor: `IPL player for ${p.teams.join(', ')} — ${p.runs} runs, ${p.wickets} wickets in ${p.matches} matches.`,
    signatureFeat,
    identityDNA          : dna,
    identityTags         : tags,
    auraEmbedding,
  });
}

const content = `import { Player } from './types';
export const PLAYERS: Player[] = ${JSON.stringify(finalPlayers, null, 2)};
`;

fs.writeFileSync('lib/players_generated.ts', content);
console.log(`Generated ${finalPlayers.length} players with Identity DNA + Era Memory.`);
