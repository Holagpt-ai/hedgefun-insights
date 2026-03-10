// Core domain types for HedgeFun

export interface Stock {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change_amount: number | null;
  change_percent: number | null;
  market_cap: number | null;
  volume: number | null;
  pe_ratio: number | null;
  eps: number | null;
  revenue: number | null;
  week_52_high: number | null;
  week_52_low: number | null;
  beta: number | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  description: string | null;
  website: string | null;
  logo_url: string | null;
  updated_at: string;
}

export interface MarketMover {
  id: string;
  symbol: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  type: 'gainer' | 'loser' | 'active' | 'premarket' | 'afterhours';
  session_date: string;
  updated_at: string;
}

export interface MarketIndex {
  id: string;
  name: string;
  symbol: string;
  current_value: number | null;
  change_amount: number | null;
  change_percent: number | null;
  sparkline_data: number[] | null;
  updated_at: string;
}

export interface IPO {
  id: string;
  symbol: string | null;
  name: string;
  ipo_date: string;
  price_range: string | null;
  offer_price: number | null;
  status: 'recent' | 'upcoming' | 'spac';
  exchange: string | null;
  created_at: string;
}

export interface MarketNews {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  category: 'markets' | 'stocks' | 'ipo' | 'etf' | 'general';
  published_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  added_at: string;
}

export interface EarningsEvent {
  id: string;
  symbol: string;
  company_name: string;
  report_date: string;
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_percent: number | null;
  time_of_day: 'before_open' | 'after_close' | 'during';
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  plan: 'free' | 'pro' | 'admin';
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing';
  current_period_end: string | null;
  preferred_language: 'en' | 'es';
  preferred_theme: 'light' | 'dark';
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  plan: 'free' | 'pro_monthly' | 'pro_annual';
  status: 'active' | 'inactive' | 'canceled' | 'past_due' | 'trialing';
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}
