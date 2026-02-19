export interface UserProfile {
  login: string;
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  pronouns: string | null;
  twitter: string | null;
}

export interface UserStats {
  stars: number;
  repos: number;
  prs: number;
  issues: number;
  commits: number;
}

export interface LanguageStat {
  name: string;
  size: number;
  color: string;
}

export interface ProfileData {
  user: UserProfile;
  stats: UserStats;
  languages: LanguageStat[];
}

export interface CardOptions {
  theme?: string;
  title_color?: string;
  text_color?: string;
  icon_color?: string;
  bg_color?: string;
  border_color?: string;
  hide_border?: boolean;
  compact?: boolean;
  hide?: string[];
}
