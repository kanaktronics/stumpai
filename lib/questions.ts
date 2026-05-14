import { Player, Question, Phase } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// QUESTION ARCHITECTURE — Three-Phase Design
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 (pool > 50): STRUCTURED BINARY questions targeting hard attributes.
// Phase 2 (pool 10–50): Identity + Franchise + Stat threshold questions.
// Phase 3 (pool < 10): Dynamic Gemini-generated questions.
// ═══════════════════════════════════════════════════════════════════════════════

export const QUESTION_BANK: Question[] = [

  // ── PHASE 1: MAXIMUM ENTROPY STRUCTURAL SPLITS (Weight 10) ───────────
  {
    id: 'isOverseas',
    text: "Is your player from outside India — an overseas import?",
    hint: "Overseas stars: Gayle, de Villiers, Malinga, Russell, Stokes, Rashid Khan.",
    attr: 'isOverseas',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 40,
  },
  {
    id: 'isPureBowler',
    text: "Is your player primarily a bowler?",
    hint: "Pure bowlers: Bumrah, Malinga, Rashid Khan, Chahal, Shami.",
    attr: 'role', attrFn: (p) => p.role === 'bowler',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 35,
  },
  {
    id: 'isPureBatter',
    text: "Is your player primarily a batter?",
    hint: "Pure batters: Kohli, Rohit, Gayle, Warner, de Villiers, Dhawan.",
    attr: 'role', attrFn: (p) => p.role === 'batsman',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 45,
  },
  {
    id: 'isAllrounder',
    text: "Is your player an all-rounder with both bat and ball?",
    hint: "All-rounders: Jadeja, Hardik, Stokes, Russell, Pollard, Bravo.",
    attr: 'role', attrFn: (p) => p.role === 'allrounder',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 20,
  },
  {
    id: 'isWicketkeeper',
    text: "Is your player a wicket-keeper?",
    hint: "Wicketkeepers: Dhoni, KL Rahul, Pant, Samson, DK, Ishan Kishan.",
    attr: 'role', attrFn: (p) => p.role === 'wicketkeeper' || p.cluster === 'wicketkeeper-batter',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 8,
  },
  {
    id: 'battingLeft',
    text: "Does your player bat left-handed?",
    hint: "Left-handers: Gayle, Dhawan, Yuvraj, Pant, Kishan, Narine.",
    attr: 'battingStyle', attrFn: (p) => p.battingStyle === 'left',
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 30,
  },
  {
    id: 'isFastBowler',
    text: "Is your player a PACE bowler (fast/medium)?",
    hint: "Pace bowlers: Bumrah, Malinga, Starc, Cummins, Shami, Bhuvi.",
    attr: 'bowlingStyle', 
    attrFn: (p) => {
      const isPace = p.bowlingStyle.includes('fast') || p.bowlingStyle.includes('medium');
      const isSpecialist = p.role === 'bowler' || p.role === 'allrounder' || !!p.wicketsAbove50;
      return isPace && isSpecialist;
    },
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 35,
  },
  {
    id: 'isSpinBowler',
    text: "Is your player a SPIN bowler?",
    hint: "Spinners: Ashwin, Chahal, Jadeja, Narine, Rashid, Kuldeep.",
    attr: 'bowlingStyle', 
    attrFn: (p) => {
      const isSpin = p.bowlingStyle.includes('spin');
      const isSpecialist = p.role === 'bowler' || p.role === 'allrounder' || !!p.wicketsAbove50;
      return isSpin && isSpecialist;
    },
    weight: 10, identityPower: 1.0, phase: 1, expectedSplit: 30,
  },

  // ── PHASE 1: ERAS AND LONGEVITY (Weight 9) ─────────────────────────
  {
    id: 'retiredFromIPL',
    text: "Has your player officially retired or stepped away from the IPL?",
    hint: "Retired: Raina, de Villiers, Gayle, Malinga, Warne, Watson.",
    attr: 'retiredFromIPL',
    weight: 9, identityPower: 0.9, phase: 1, expectedSplit: 40,
  },
  {
    id: 'playedBefore2012',
    text: "Did your player play in the very first IPL seasons (2008–2011)?",
    hint: "Early era: Warne, Tendulkar, Gilchrist, Sohail Tanvir, Hayden.",
    attr: 'playedBefore2012',
    weight: 9, identityPower: 0.9, phase: 1, expectedSplit: 45,
  },
  {
    id: 'playedAfter2018',
    text: "Is your player active in the modern IPL era (2019 or later)?",
    hint: "Modern era: SKY, Rinku Singh, Jaiswal, Ruturaj, Bishnoi.",
    attr: 'playedAfter2018',
    weight: 9, identityPower: 0.9, phase: 1, expectedSplit: 45,
  },
  {
    id: 'playedSeasons7plus',
    text: "Has your player played in at least 7 different IPL seasons?",
    hint: "Longevity separates established players from flash-in-the-pans.",
    attr: 'playedSeasons7plus',
    weight: 9, identityPower: 0.9, phase: 1, expectedSplit: 35,
  },

  // ── PHASE 2: MIDGAME FRANCHISE IDENTITY (Weight 8) ───────────────
  // These destroy entropy rapidly by collapsing massive team cohorts
  {
    id: 'everPlayedMI',
    text: "Has your player ever played for Mumbai Indians (MI)?",
    hint: "MI alumni: Rohit, Pollard, Malinga, Bumrah, Hardik, Rayudu.",
    attr: 'everPlayedMI',
    weight: 8, phase: 2, expectedSplit: 20,
  },
  {
    id: 'everPlayedCSK',
    text: "Has your player ever played for Chennai Super Kings (CSK)?",
    hint: "CSK alumni: Dhoni, Raina, Jadeja, Ashwin, Bravo, Faf, Hussey.",
    attr: 'everPlayedCSK',
    weight: 8, phase: 2, expectedSplit: 20,
  },
  {
    id: 'everPlayedRCB',
    text: "Has your player ever played for Royal Challengers Bengaluru (RCB)?",
    hint: "RCB alumni: Kohli, ABD, Gayle, Chahal, Siraj, Maxwell.",
    attr: 'everPlayedRCB',
    weight: 8, phase: 2, expectedSplit: 20,
  },
  {
    id: 'everPlayedKKR',
    text: "Has your player ever played for Kolkata Knight Riders (KKR)?",
    hint: "KKR alumni: Gambhir, Narine, Russell, Uthappa, Kuldeep.",
    attr: 'everPlayedKKR',
    weight: 8, phase: 2, expectedSplit: 20,
  },
  {
    id: 'everPlayedRR',
    text: "Has your player ever played for Rajasthan Royals (RR)?",
    hint: "RR alumni: Samson, Buttler, Warne, Watson, Gopal, Archer.",
    attr: 'everPlayedRR',
    weight: 8, phase: 2, expectedSplit: 20,
  },
  {
    id: 'singleTeamLoyal',
    text: "Has your player played for ONLY ONE franchise in their entire IPL career?",
    hint: "One-team loyalists: Kohli (RCB), Bumrah (MI), Malinga (MI), Narine (KKR).",
    attr: 'singleTeamLoyal',
    weight: 8, phase: 2, expectedSplit: 10,
  },
  {
    id: 'multipleTeams',
    text: "Has your player played for 3 or more different IPL franchises?",
    hint: "Journeymen: Finch, Karthik, Yuvraj, Uthappa, Unadkat.",
    attr: 'multipleTeams',
    weight: 8, phase: 2, expectedSplit: 30,
  },

  // ── PHASE 2: ARCHETYPE VECTORS (Weight 8) ────────────────────────
  {
    id: 'isFinisherArchetype',
    text: "Is your player primarily known as a 'finisher' in the death overs?",
    hint: "Finishers: Dhoni, Russell, Pollard, Miller, Tewatia, Rinku Singh.",
    attr: 'cluster', attrFn: (p) => p.cluster === 'finisher' || !!(p.identityTags && p.identityTags.includes('death overs match finisher')),
    weight: 8, phase: 2, expectedSplit: 15,
  },
  {
    id: 'isDeathBowlerArchetype',
    text: "Is your player heavily relied upon as a 'death over' bowling specialist?",
    hint: "Death Bowlers: Bumrah, Malinga, Bravo, Harshal Patel, Arshdeep.",
    attr: 'cluster', attrFn: (p) => p.cluster === 'death-bowler' || !!(p.identityTags && p.identityTags.includes('death over specialist')),
    weight: 8, phase: 2, expectedSplit: 15,
  },
  {
    id: 'isMysterySpinnerArchetype',
    text: "Is your player famous for being a 'mystery' spinner?",
    hint: "Mystery Spinners: Narine, Varun Chakaravarthy, Mujeeb, Ashwin.",
    attr: 'cluster', attrFn: (p) => p.cluster === 'mystery-spinner',
    weight: 8, phase: 2, expectedSplit: 5,
  },
  {
    id: 'isPowerHitterArchetype',
    text: "Is your player known specifically for brutal power-hitting and massive sixes?",
    hint: "Power Hitters: Gayle, Russell, Pollard, Maxwell, Hetmyer.",
    attr: 'identityTags', attrFn: (p) => !!(p.identityTags && (p.identityTags.includes('brutal six hitter') || p.identityTags.includes('match-winner'))),
    weight: 8, phase: 2, expectedSplit: 15,
  },

  // ── PHASE 2: PRIMARY FRANCHISE (Weight 7) ────────────────────────
  // Differs from "ever played" — this is their main identity
  {
    id: 'primaryTeamMI',
    text: "Is your player PRIMARILY remembered as a Mumbai Indians (MI) player?",
    hint: "MI core: Rohit, Pollard, Bumrah, Malinga.",
    attr: 'primaryTeamMI',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'primaryTeamCSK',
    text: "Is your player PRIMARILY remembered as a Chennai Super Kings (CSK) player?",
    hint: "CSK core: Dhoni, Raina, Jadeja, Ashwin.",
    attr: 'primaryTeamCSK',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'primaryTeamRCB',
    text: "Is your player PRIMARILY remembered as a Royal Challengers Bengaluru (RCB) player?",
    hint: "RCB core: Kohli, ABD, Gayle.",
    attr: 'primaryTeamRCB',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'primaryTeamKKR',
    text: "Is your player PRIMARILY remembered as a Kolkata Knight Riders (KKR) player?",
    hint: "KKR core: Gambhir, Narine, Russell.",
    attr: 'primaryTeamKKR',
    weight: 7, phase: 2, expectedSplit: 15,
  },

  // ── PHASE 2: INTERNATIONAL ORIGIN (Weight 7) ─────────────────────
  {
    id: 'isAustralian',
    text: "Is your player from Australia?",
    hint: "Aussie stars: Warner, Watson, Gilchrist, Cummins, Maxwell.",
    attr: 'country', attrFn: (p) => p.country === 'Australia',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'isSouthAfrican',
    text: "Is your player from South Africa?",
    hint: "Proteas: ABD, Steyn, Faf, Miller, Rabada.",
    attr: 'country', attrFn: (p) => p.country === 'South Africa',
    weight: 7, phase: 2, expectedSplit: 10,
  },
  {
    id: 'isEnglish',
    text: "Is your player from England?",
    hint: "Englishmen: Stokes, Buttler, Bairstow, Archer, Pietersen.",
    attr: 'country', attrFn: (p) => p.country === 'England',
    weight: 7, phase: 2, expectedSplit: 8,
  },
  {
    id: 'isWestIndian',
    text: "Is your player from the West Indies?",
    hint: "Windies: Gayle, Russell, Pollard, Bravo, Narine.",
    attr: 'country', attrFn: (p) => p.country === 'West Indies',
    weight: 7, phase: 2, expectedSplit: 8,
  },

  // ── PHASE 2: CAREER VOLUME & STAT THRESHOLDS (Weight 7) ───────────
  // These separate legends from role players and fringe players
  {
    id: 'matchesAbove50',
    text: "Has your player played more than 50 IPL matches?",
    hint: "50+ matches means an established, multi-year IPL regular.",
    attr: 'matchesAbove50',
    weight: 7, phase: 2, expectedSplit: 35,
  },
  {
    id: 'matchesAbove100',
    text: "Has your player played more than 100 IPL matches?",
    hint: "The 100-match club is reserved for true IPL veterans.",
    attr: 'matchesAbove100',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'runsAbove2000',
    text: "Has your player scored more than 2,000 career runs in the IPL?",
    hint: "2000+ runs indicates a primary batter who played for several years.",
    attr: 'runsAbove2000',
    weight: 7, phase: 2, expectedSplit: 15,
  },
  {
    id: 'wicketsAbove50',
    text: "Has your player taken more than 50 career IPL wickets?",
    hint: "50+ wickets indicates a frontline frontline bowler for multiple seasons.",
    attr: 'wicketsAbove50',
    weight: 7, phase: 2, expectedSplit: 20,
  },

  // ── PHASE 2: PERFORMANCE EXTREMES (Weight 6) ─────────────────────
  // These target high-certainty edges
  {
    id: 'centuries',
    text: "Has your player ever scored a century (100+ runs) in the IPL?",
    hint: "IPL centurions: Gayle, Kohli, Watson, Warner, Samson, Buttler, Valthaty.",
    attr: 'centuries',
    weight: 6, phase: 2, expectedSplit: 8,
  },
  {
    id: 'fiveWickets',
    text: "Has your player ever taken a five-wicket haul in an IPL match?",
    hint: "5-wicket heroes: Malinga, Bumrah, Chahal, Sohail Tanvir, Alzarri.",
    attr: 'fiveWickets',
    weight: 6, phase: 2, expectedSplit: 6,
  },
  {
    id: 'strikeRateAbove150',
    text: "Is your player's career batting strike rate over 150.0?",
    hint: "High-strike rate beasts: Russell, Narine, Sehwag, Maxwell, Pooran.",
    attr: 'strikeRateAbove150',
    weight: 6, phase: 2, expectedSplit: 10,
  },
  {
    id: 'economyBelow7',
    text: "Is your player's career bowling economy rate below 7.0?",
    hint: "Miserly bowlers: Rashid Khan, Sunil Narine, Malinga, Ashwin.",
    attr: 'economyBelow7',
    weight: 6, phase: 2, expectedSplit: 10,
  },

  // ── PHASE 2: CLUSTER / ARCHETYPE IDENTIFICATION (Weight 5) ────────
  // To lock down specific player profiles
  {
    id: 'uncappedGem',
    text: "Is your player famous primarily for their IPL heroics before making it big internationally?",
    hint: "Uncapped gems/domestic heroes: Rinku Singh, Paul Valthaty, Rahul Tewatia.",
    attr: 'cluster', attrFn: (p) => p.cluster === 'uncapped-gem' || p.cluster === 'rr-one-season-wonder',
    weight: 5, phase: 2, expectedSplit: 10,
  },
  {
    id: 'captain',
    text: "Has your player ever captained an IPL franchise?",
    hint: "Captains: Dhoni, Rohit, Kohli, Gambhir, Warner, Iyer, Pant, Samson.",
    attr: 'iplCaptain',
    weight: 5, phase: 2, expectedSplit: 15,
  },
  {
    id: 'orangeCap',
    text: "Has your player ever won the Orange Cap (highest run scorer)?",
    hint: "Orange Cap: Kohli, Warner, KL Rahul, Dhawan, Gayle.",
    attr: 'orangeCap',
    weight: 5, phase: 2, expectedSplit: 5,
  },
  {
    id: 'purpleCap',
    text: "Has your player ever won the Purple Cap (highest wicket taker)?",
    hint: "Purple Cap: Malinga, Bumrah, Chahal, Bravo, Harshal Patel, Tanvir.",
    attr: 'purpleCap',
    weight: 5, phase: 2, expectedSplit: 5,
  }
];

// Helper to filter questions by phase
// Phase 1: Only Phase 1 questions (max entropy)
// Phase 2: Phase 1 + Phase 2 questions
export function getPhaseQuestions(phase: 1 | 2 | 3 | 4): Question[] {
  if (phase === 1) return QUESTION_BANK.filter(q => q.phase === 1);
  return QUESTION_BANK; // Phase 2, 3 & 4 have access to everything
}
