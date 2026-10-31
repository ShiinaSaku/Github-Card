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
  /** null means unavailable, not zero (for example, organization activity totals). */
  prs: number | null;
  issues: number | null;
  commits: number | null;
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
  hide_langs?: string[];
  show_langs?: string[];
  animate?: boolean;
  /** Stable namespace for multiple cards embedded in the same SVG document. */
  idPrefix?: string;
}
