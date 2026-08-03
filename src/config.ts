export const API_BASE_URL = import.meta.env.DEV
  ? '/tjstats-api/match-auth-app/open/v1'
  : 'https://open.tjstats.com/match-auth-app/open/v1'

export const PLAYER_POSITION_MAPPING: Record<string, string> = {
  TOP: '上单',
  JUG: '打野',
  MID: '中单',
  AD: '射手',
  SUP: '辅助',
}

export const HERO_POSITION_MAPPING: Record<string, string> = {
  TOP: '上单',
  JUN: '打野',
  MID: '中单',
  BOT: '射手',
  SUP: '辅助',
}

export const FIELD_MAPPINGS = {
  player: {
    playerId: '选手系统ID', playerName: '选手游戏ID', playerLocation: '选手位置',
    teamName: '队名', kda: 'KDA', killPerGame: '场均击杀',
    goldGapPerGame: '场均经济差', goldPerMinute: '分均经济', damagePerGold: '伤转',
    damagePerMinute: '分均输出', damagePercent: '输出占比', damageTakenPerMinute: '分均承伤',
    damageTakenPercent: '承伤占比', mvpCount: 'MVP数', deathPerGame: '场均死亡',
    creepScorePerGame: '场均补刀', visionScorePerGame: '场均视野分',
    wardKilledPerGame: '场均排眼', wardPlacedPerGame: '场均插眼',
  },
  hero: {
    heroCnName: '英雄名', heroCnTitle: '英雄称号', bPRate: 'BP率',
    bpCount: 'BP数', banRate: '禁用率', banCount: '禁用数',
    pickRate: '选取率', pickCount: '出场次数', winningRate: '胜率',
    winningCount: '胜场', mostUsePlayerName: '最多选取选手',
    heroLocation: '英雄分路', kDA: 'KDA', killPerGame: '场均击杀',
    deathPerGame: '场均死亡', assistPerGame: '场均助攻',
  },
  team: {
    teamId: '队伍系统ID', teamName: '队伍名', gameCount: '总场数',
    drakeKillPerGameTeam: '场均小龙', baronKillPerGameTeam: '场均大龙',
    killPerGameTeam: '场均击杀', deathPerGameTeam: '场均死亡',
    assistPerGameTeam: '场均助攻', timePerGameTeam: '场均时长',
    winningRate: '大场胜率', riftHeraldControlRate: '场均先锋',
    firstBloodRateTeam: '一血率', firstDragonControlRate: '一龙率',
    firstTorrentRateTeam: '一塔率',
  },
  team_game: {
    groupName: '队伍分组', stageName: '赛事标签', teamAId: '队伍AID',
    teamBId: '队伍BID', teamAName: '队伍A名字', teamBName: '队伍B名字',
    teamAScore: '队伍A比分', teamBScore: '队伍B比分', startTime: '比赛发生时间',
    winTeamId: '获胜队伍ID', matchId: '比赛ID',
  },
  player_hero: {
    heroName: '英雄名', heroTitle: '英雄称号', kill: '击杀', death: '死亡',
    assist: '助攻', teamID: '队伍ID', teamName: '队伍名',
    fightTeamID: '对手ID', fightTeamName: '对手名', startTime: '选取时间',
    winTeamID: '获胜方ID',
  },
} as const

export const DEFAULT_API_KEY = '7935be4c41d8760a28c05581a7b1f570'
export const DEFAULT_SEASON_ID = 237
export const DEFAULT_STAGE_IDS = '112,113,100'
