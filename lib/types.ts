export interface AuraEmbedding {
  composed?: number;
  aggressive?: number;
  explosive?: number;
  innovative?: number;
  captainLike?: number;
  silentKiller?: number;
}

export interface IdentityDNA {
  finisher?: number;
  anchor?: number;
  powerHitter?: number;
  strokeMaker?: number;
  opener?: number;
  deathBowler?: number;
  spinWizard?: number;
  paceAggressor?: number;
  economySpecialist?: number;
  clutchPlayer?: number;
  captainAura?: number;
  memeFactor?: number;
  fanbaseIntensity?: number;
  underdog?: number;
  longevity?: number;
  oneSeasonWonder?: number;
  consistent?: number;
}

export type IPLEra = 'early' | 'golden' | 'modern';

// Semantic cluster: what "type" of player is this?
// Used for early-game cluster identification.
export type PlayerCluster =
  | 'mi-death-bowler'        // MI pace specialists (Malinga, Bumrah, Shami)
  | 'csk-legend'             // CSK cornerstones (Dhoni, Raina, Jadeja)
  | 'rcb-overseas-hitter'    // RCB foreign power (Gayle, ABD, Maxwell)
  | 'kkr-mystery-spinner'    // KKR spin weapons (Narine, Chawla, Kuldeep)
  | 'rr-one-season-wonder'   // RR flash heroes (Tanvir, Valthaty, Warne era)
  | 'srh-run-miser'          // SRH/DC economy bowlers (Bhuvneshwar, Rashid)
  | 'indian-anchor'          // Reliable Indian middle-order (Rahane, Iyer)
  | 'overseas-power-hitter'  // Foreign sloggers (Gayle, Pollard, Russell)
  | 'indian-opener'          // Indian openers (Dhawan, Rohit, KL, Virat)
  | 'indian-fast-bowler'     // India pace (Bumrah, Shami, Siraj, Ishant)
  | 'domestic-allrounder'    // Underrated domestic (Pandey, Karthik, Tiwary)
  | 'overseas-spinner'       // Foreign spinners (Rashid, Narine, Imran Tahir)
  | 'uncapped-gem'           // Unknown/domestic heroes
  | 'wicketkeeper-batter'    // WK specialists
  | 'utility-player'         // Does a bit of everything
  | string;                  // Fallback for new/unknown clusters

export interface Player {
  id: string;
  name: string;
  role: 'batsman' | 'bowler' | 'allrounder' | 'wicketkeeper';
  battingStyle: 'right' | 'left';
  bowlingStyle: 'right-fast' | 'left-fast' | 'right-medium' | 'left-medium' | 'right-spin' | 'left-spin' | 'none';
  country: string;
  isIndian: boolean;
  isOverseas: boolean;
  retiredFromIPL?: boolean;
  teams: string[];
  activeYears: number[];
  era: IPLEra;
  cluster: PlayerCluster;          // Semantic archetype cluster
  
  // RAW STATISTICS (Derived from CSV)
  runs?: number;
  wickets?: number;
  strikeRate?: number;
  matches?: number;

  // ── Trophy / Honours ──────────────────────────────────────────────────────
  titles?: number;
  orangeCap?: boolean;
  purpleCap?: boolean;
  under19WorldCup?: boolean;
  internationalCaptain?: boolean;
  iplCaptain?: boolean;

  // ── Performance Binary Fingerprints (40+ attributes) ─────────────────────
  centuries?: boolean;              
  fifties?: boolean;                
  highScoreAbove75?: boolean;       
  runsAbove500?: boolean;           
  runsAbove2000?: boolean;          
  runsAbove4000?: boolean;          
  matchesAbove50?: boolean;         
  matchesAbove100?: boolean;        
  matchesAbove150?: boolean;        

  strikeRateAbove150?: boolean;     
  strikeRateAbove130?: boolean;     
  strikeRateAbove110?: boolean;     
  sixesAbove50?: boolean;           
  sixesAbove100?: boolean;          
  avgRunsPerMatchAbove25?: boolean; 
  avgRunsPerMatchAbove15?: boolean; 

  fiveWickets?: boolean;            
  wicketsAbove50?: boolean;         
  wicketsAbove100?: boolean;        
  wicketsAbove150?: boolean;        
  potmAbove3?: boolean;             
  potmAbove10?: boolean;            

  economyBelow7?: boolean;          
  economyBelow8?: boolean;          
  economyBelow9?: boolean;          

  playedBefore2012?: boolean;       
  playedAfter2018?: boolean;        
  multipleTeams?: boolean;          
  singleTeamLoyal?: boolean;        
  playedSeasons3plus?: boolean;     
  playedSeasons7plus?: boolean;     
  playedSeasons10plus?: boolean;    

  primaryTeamMI?: boolean;
  primaryTeamCSK?: boolean;
  primaryTeamRCB?: boolean;
  primaryTeamKKR?: boolean;
  primaryTeamRR?: boolean;
  primaryTeamSRH?: boolean;
  primaryTeamDC?: boolean;
  primaryTeamPBKS?: boolean;
  everPlayedMI?: boolean;
  everPlayedCSK?: boolean;
  everPlayedRCB?: boolean;
  everPlayedKKR?: boolean;
  everPlayedRR?: boolean;
  everPlayedSRH?: boolean;

  famousFor: string;
  signatureFeat?: string | null;
  identityDNA: IdentityDNA;
  identityTags: string[];
  auraEmbedding: AuraEmbedding;
}

export type Attr = string;
export type Answer = 'yes' | 'no' | 'maybe' | 'dont-know';

export type Phase = 1 | 2 | 3 | 4;

export interface Question {
  id: string;
  text: string;
  hint: string;
  attr: keyof Player;
  attrFn?: (p: Player) => boolean;
  weight: number;
  identityPower?: number; // Optional
  phase: Phase;
  expectedSplit?: number; 
}

export interface BayesianState {
  probabilities: Record<string, number>;
  history: { questionId: string; answer: Answer }[];
  phase: Phase;
}
