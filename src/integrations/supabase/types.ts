export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      affiliate_applications: {
        Row: {
          audience_size: string | null
          email: string
          id: string
          name: string
          promotion_plan: string | null
          submitted_at: string | null
          website_url: string | null
        }
        Insert: {
          audience_size?: string | null
          email: string
          id?: string
          name: string
          promotion_plan?: string | null
          submitted_at?: string | null
          website_url?: string | null
        }
        Update: {
          audience_size?: string | null
          email?: string
          id?: string
          name?: string
          promotion_plan?: string | null
          submitted_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      after_hours_feed_state: {
        Row: {
          gainer_count: number
          generation_id: string
          loser_count: number
          provider_as_of_max: string | null
          provider_as_of_min: string | null
          session_date: string
          state_key: string
          status: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          gainer_count: number
          generation_id: string
          loser_count: number
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          session_date: string
          state_key: string
          status: string
          synced_at: string
          updated_at: string
        }
        Update: {
          gainer_count?: number
          generation_id?: string
          loser_count?: number
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          session_date?: string
          state_key?: string
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      after_hours_mover_results: {
        Row: {
          change_amount: number
          change_percent: number
          company_name: string | null
          extended_last: number
          generation_id: string
          observation_source: string
          provider_as_of: string
          rank: number
          regular_close: number
          side: string
          symbol: string
          updated_at: string
          volume: number | null
        }
        Insert: {
          change_amount: number
          change_percent: number
          company_name?: string | null
          extended_last: number
          generation_id: string
          observation_source: string
          provider_as_of: string
          rank: number
          regular_close: number
          side: string
          symbol: string
          updated_at: string
          volume?: number | null
        }
        Update: {
          change_amount?: number
          change_percent?: number
          company_name?: string | null
          extended_last?: number
          generation_id?: string
          observation_source?: string
          provider_as_of?: string
          rank?: number
          regular_close?: number
          side?: string
          symbol?: string
          updated_at?: string
          volume?: number | null
        }
        Relationships: []
      }
      agentic_seo_log: {
        Row: {
          audit_passed: boolean | null
          audit_score: number | null
          auditor_model: string | null
          created_at: string | null
          cts_composite_score: number | null
          generated_content: Json | null
          generator_model: string | null
          id: string
          page_type: string
          symbol: string
          tier: string | null
        }
        Insert: {
          audit_passed?: boolean | null
          audit_score?: number | null
          auditor_model?: string | null
          created_at?: string | null
          cts_composite_score?: number | null
          generated_content?: Json | null
          generator_model?: string | null
          id?: string
          page_type: string
          symbol: string
          tier?: string | null
        }
        Update: {
          audit_passed?: boolean | null
          audit_score?: number | null
          auditor_model?: string | null
          created_at?: string | null
          cts_composite_score?: number | null
          generated_content?: Json | null
          generator_model?: string | null
          id?: string
          page_type?: string
          symbol?: string
          tier?: string | null
        }
        Relationships: []
      }
      ai_conversation_sessions: {
        Row: {
          id: string
          last_active_at: string
          message_count: number
          metadata: Json
          session_token: string
          started_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_active_at?: string
          message_count?: number
          metadata?: Json
          session_token: string
          started_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_active_at?: string
          message_count?: number
          metadata?: Json
          session_token?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          surface: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          surface?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          surface?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_daily_briefings: {
        Row: {
          briefing_date: string
          briefing_text: string
          generated_at: string
          highlights: Json
          id: string
          stats: Json
          user_id: string
        }
        Insert: {
          briefing_date?: string
          briefing_text: string
          generated_at?: string
          highlights?: Json
          id?: string
          stats?: Json
          user_id: string
        }
        Update: {
          briefing_date?: string
          briefing_text?: string
          generated_at?: string
          highlights?: Json
          id?: string
          stats?: Json
          user_id?: string
        }
        Relationships: []
      }
      ai_daily_logs: {
        Row: {
          created_at: string
          entry_type: string
          id: number
          log_date: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_type: string
          id?: number
          log_date?: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          entry_type?: string
          id?: number
          log_date?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          model: string | null
          role: string
          tool_calls: Json
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          role: string
          tool_calls?: Json
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          role?: string
          tool_calls?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_memory: {
        Row: {
          extensions: Json
          goals: Json
          recurring_observations: Json
          risk_tolerance: Json
          skill_patterns: Json
          tickers_of_interest: Json
          trading_style: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          extensions?: Json
          goals?: Json
          recurring_observations?: Json
          risk_tolerance?: Json
          skill_patterns?: Json
          tickers_of_interest?: Json
          trading_style?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          extensions?: Json
          goals?: Json
          recurring_observations?: Json
          risk_tolerance?: Json
          skill_patterns?: Json
          tickers_of_interest?: Json
          trading_style?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalyst_events: {
        Row: {
          company_name: string | null
          created_at: string
          dedupe_key: string
          description: string | null
          event_date: string
          event_time: string | null
          event_type: string
          facts: Json
          id: string
          provider: string
          provider_article_id: string | null
          published_at: string | null
          related_symbols: string[]
          source_name: string
          source_url: string | null
          symbol: string
          time_of_day: string | null
          title: string
          updated_at: string
          verification_state: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          dedupe_key: string
          description?: string | null
          event_date: string
          event_time?: string | null
          event_type: string
          facts?: Json
          id?: string
          provider: string
          provider_article_id?: string | null
          published_at?: string | null
          related_symbols?: string[]
          source_name: string
          source_url?: string | null
          symbol: string
          time_of_day?: string | null
          title: string
          updated_at?: string
          verification_state?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          dedupe_key?: string
          description?: string | null
          event_date?: string
          event_time?: string | null
          event_type?: string
          facts?: Json
          id?: string
          provider?: string
          provider_article_id?: string | null
          published_at?: string | null
          related_symbols?: string[]
          source_name?: string
          source_url?: string | null
          symbol?: string
          time_of_day?: string | null
          title?: string
          updated_at?: string
          verification_state?: string
        }
        Relationships: []
      }
      catalyst_user_state: {
        Row: {
          created_at: string
          event_id: string
          id: string
          reviewed_at: string | null
          saved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          reviewed_at?: string | null
          saved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          reviewed_at?: string | null
          saved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalyst_user_state_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "catalyst_events"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_sessions: {
        Row: {
          created_at: string | null
          id: string
          last_active_at: string | null
          messages: Json | null
          session_token: string
          total_tokens_used: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_active_at?: string | null
          messages?: Json | null
          session_token: string
          total_tokens_used?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          last_active_at?: string | null
          messages?: Json | null
          session_token?: string
          total_tokens_used?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          email: string | null
          id: string
          message: string | null
          name: string | null
          subject: string | null
          submitted_at: string | null
        }
        Insert: {
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
          submitted_at?: string | null
        }
        Update: {
          email?: string | null
          id?: string
          message?: string | null
          name?: string | null
          subject?: string | null
          submitted_at?: string | null
        }
        Relationships: []
      }
      daily_briefs: {
        Row: {
          brief_date: string
          brief_type: string
          content: string
          generated_at: string
          id: string
          market_snapshot: Json
        }
        Insert: {
          brief_date?: string
          brief_type: string
          content: string
          generated_at?: string
          id?: string
          market_snapshot?: Json
        }
        Update: {
          brief_date?: string
          brief_type?: string
          content?: string
          generated_at?: string
          id?: string
          market_snapshot?: Json
        }
        Relationships: []
      }
      earnings_calendar: {
        Row: {
          actual_eps: number | null
          company_name: string
          created_at: string | null
          estimate_eps: number | null
          id: string
          report_date: string
          surprise_percent: number | null
          symbol: string
          time_of_day: string | null
        }
        Insert: {
          actual_eps?: number | null
          company_name: string
          created_at?: string | null
          estimate_eps?: number | null
          id?: string
          report_date: string
          surprise_percent?: number | null
          symbol: string
          time_of_day?: string | null
        }
        Update: {
          actual_eps?: number | null
          company_name?: string
          created_at?: string | null
          estimate_eps?: number | null
          id?: string
          report_date?: string
          surprise_percent?: number | null
          symbol?: string
          time_of_day?: string | null
        }
        Relationships: []
      }
      etfs: {
        Row: {
          asset_class: string | null
          change_percent: number | null
          expense_ratio: number | null
          holdings: number | null
          id: string
          inception_date: string | null
          name: string
          price: number | null
          provider: string | null
          symbol: string
          total_assets: number | null
          updated_at: string | null
          volume: number | null
          ytd_return: number | null
        }
        Insert: {
          asset_class?: string | null
          change_percent?: number | null
          expense_ratio?: number | null
          holdings?: number | null
          id?: string
          inception_date?: string | null
          name: string
          price?: number | null
          provider?: string | null
          symbol: string
          total_assets?: number | null
          updated_at?: string | null
          volume?: number | null
          ytd_return?: number | null
        }
        Update: {
          asset_class?: string | null
          change_percent?: number | null
          expense_ratio?: number | null
          holdings?: number | null
          id?: string
          inception_date?: string | null
          name?: string
          price?: number | null
          provider?: string | null
          symbol?: string
          total_assets?: number | null
          updated_at?: string | null
          volume?: number | null
          ytd_return?: number | null
        }
        Relationships: []
      }
      game_config: {
        Row: {
          id: string
          key: string
          season_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          season_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          season_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_config_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_leaderboard: {
        Row: {
          cash_balance: number
          display_name: string
          id: string
          pnl_pct: number
          position_count: number
          rank: number | null
          season_id: string
          total_pnl: number
          total_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_balance?: number
          display_name: string
          id?: string
          pnl_pct?: number
          position_count?: number
          rank?: number | null
          season_id: string
          total_pnl?: number
          total_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_balance?: number
          display_name?: string
          id?: string
          pnl_pct?: number
          position_count?: number
          rank?: number | null
          season_id?: string
          total_pnl?: number
          total_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_leaderboard_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_portfolios: {
        Row: {
          cash_balance: number
          display_name: string
          id: string
          joined_at: string
          rank: number | null
          realized_pnl: number
          season_id: string
          total_value: number
          unrealized_pnl: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cash_balance?: number
          display_name: string
          id?: string
          joined_at?: string
          rank?: number | null
          realized_pnl?: number
          season_id: string
          total_value?: number
          unrealized_pnl?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cash_balance?: number
          display_name?: string
          id?: string
          joined_at?: string
          rank?: number | null
          realized_pnl?: number
          season_id?: string
          total_value?: number
          unrealized_pnl?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_portfolios_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_positions: {
        Row: {
          avg_cost_price: number
          current_price: number
          id: string
          market_value: number
          opened_at: string
          portfolio_id: string
          season_id: string
          shares: number
          symbol: string
          unrealized_pnl: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_cost_price?: number
          current_price?: number
          id?: string
          market_value?: number
          opened_at?: string
          portfolio_id: string
          season_id: string
          shares?: number
          symbol: string
          unrealized_pnl?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_cost_price?: number
          current_price?: number
          id?: string
          market_value?: number
          opened_at?: string
          portfolio_id?: string
          season_id?: string
          shares?: number
          symbol?: string
          unrealized_pnl?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "game_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_positions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_season_invite_codes: {
        Row: {
          created_at: string
          invite_code: string
          season_id: string
        }
        Insert: {
          created_at?: string
          invite_code: string
          season_id: string
        }
        Update: {
          created_at?: string
          invite_code?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_season_invite_codes_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_season_results: {
        Row: {
          created_at: string
          display_name: string
          final_pnl: number
          final_pnl_pct: number
          final_rank: number
          final_total_value: number
          id: string
          prize_eligible: boolean
          prize_status: string
          season_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          final_pnl: number
          final_pnl_pct: number
          final_rank: number
          final_total_value: number
          id?: string
          prize_eligible?: boolean
          prize_status?: string
          season_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          final_pnl?: number
          final_pnl_pct?: number
          final_rank?: number
          final_total_value?: number
          id?: string
          prize_eligible?: boolean
          prize_status?: string
          season_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_season_results_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          name: string
          prize_description: string | null
          room_type: string
          starts_at: string
          status: string
          winner_user_id: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          name: string
          prize_description?: string | null
          room_type?: string
          starts_at: string
          status?: string
          winner_user_id?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          name?: string
          prize_description?: string | null
          room_type?: string
          starts_at?: string
          status?: string
          winner_user_id?: string | null
        }
        Relationships: []
      }
      game_trades: {
        Row: {
          action: string
          cash_after: number
          cash_before: number
          executed_at: string
          id: string
          portfolio_id: string
          price_at_execution: number
          season_id: string
          shares: number
          symbol: string
          total_value: number
          user_id: string
        }
        Insert: {
          action: string
          cash_after: number
          cash_before: number
          executed_at?: string
          id?: string
          portfolio_id: string
          price_at_execution: number
          season_id: string
          shares: number
          symbol: string
          total_value: number
          user_id: string
        }
        Update: {
          action?: string
          cash_after?: number
          cash_before?: number
          executed_at?: string
          id?: string
          portfolio_id?: string
          price_at_execution?: number
          season_id?: string
          shares?: number
          symbol?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_trades_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "game_portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_trades_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ipo_list: {
        Row: {
          created_at: string | null
          exchange: string | null
          id: string
          ipo_date: string
          name: string
          offer_price: number | null
          price_range: string | null
          status: string | null
          symbol: string | null
        }
        Insert: {
          created_at?: string | null
          exchange?: string | null
          id?: string
          ipo_date: string
          name: string
          offer_price?: number | null
          price_range?: string | null
          status?: string | null
          symbol?: string | null
        }
        Update: {
          created_at?: string | null
          exchange?: string | null
          id?: string
          ipo_date?: string
          name?: string
          offer_price?: number | null
          price_range?: string | null
          status?: string | null
          symbol?: string | null
        }
        Relationships: []
      }
      journal_account_balance_snapshots: {
        Row: {
          account_id: string
          buying_power: number | null
          cash_balance: number | null
          created_at: string
          currency: string
          equity: number | null
          id: string
          snapshot_at: string
          source: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          buying_power?: number | null
          cash_balance?: number | null
          created_at?: string
          currency?: string
          equity?: number | null
          id?: string
          snapshot_at: string
          source?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          buying_power?: number | null
          cash_balance?: number | null
          created_at?: string
          currency?: string
          equity?: number | null
          id?: string
          snapshot_at?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_account_balance_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_accounts: {
        Row: {
          account_type: string | null
          base_currency: string
          broker: string | null
          closed_at: string | null
          created_at: string
          id: string
          is_paper: boolean
          is_primary: boolean
          metadata: Json
          name: string
          opened_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_type?: string | null
          base_currency?: string
          broker?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          is_paper?: boolean
          is_primary?: boolean
          metadata?: Json
          name: string
          opened_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_type?: string | null
          base_currency?: string
          broker?: string | null
          closed_at?: string | null
          created_at?: string
          id?: string
          is_paper?: boolean
          is_primary?: boolean
          metadata?: Json
          name?: string
          opened_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_ai_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          insight_id: string | null
          message_id: string | null
          rating: number | null
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          insight_id?: string | null
          message_id?: string | null
          rating?: number | null
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          insight_id?: string | null
          message_id?: string | null
          rating?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_ai_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "journal_ai_insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_ai_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "journal_ai_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_ai_insights: {
        Row: {
          body: string | null
          created_at: string
          id: string
          payload: Json
          title: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json
          title?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          payload?: Json
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_ai_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          job_type: string
          payload: Json
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type: string
          payload?: Json
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          job_type?: string
          payload?: Json
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_ai_memories: {
        Row: {
          content: string
          created_at: string
          embedding_ref: string | null
          id: string
          memory_type: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding_ref?: string | null
          id?: string
          memory_type: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding_ref?: string | null
          id?: string
          memory_type?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_ai_memory_evidence: {
        Row: {
          created_at: string
          id: string
          memory_id: string
          source_ref: string | null
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          memory_id: string
          source_ref?: string | null
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          memory_id?: string
          source_ref?: string | null
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_ai_memory_evidence_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "journal_ai_memories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_ai_memory_evidence_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "journal_ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_ai_usage: {
        Row: {
          cost_estimate: number | null
          created_at: string
          id: string
          model: string | null
          occurred_at: string
          tokens_in: number | null
          tokens_out: number | null
          user_id: string
        }
        Insert: {
          cost_estimate?: number | null
          created_at?: string
          id?: string
          model?: string | null
          occurred_at?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id: string
        }
        Update: {
          cost_estimate?: number | null
          created_at?: string
          id?: string
          model?: string | null
          occurred_at?: string
          tokens_in?: number | null
          tokens_out?: number | null
          user_id?: string
        }
        Relationships: []
      }
      journal_analytics_cache: {
        Row: {
          cache_key: string
          computed_at: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          cache_key: string
          computed_at?: string
          id?: string
          payload?: Json
          user_id: string
        }
        Update: {
          cache_key?: string
          computed_at?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      journal_attachments: {
        Row: {
          byte_size: number | null
          content_type: string | null
          created_at: string
          filename: string | null
          id: string
          storage_path: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          storage_path: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          byte_size?: number | null
          content_type?: string | null
          created_at?: string
          filename?: string | null
          id?: string
          storage_path?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_attachments_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_balance_reconciliations: {
        Row: {
          account_id: string
          as_of: string
          created_at: string
          derived_equity: number | null
          difference: number | null
          id: string
          notes: string | null
          reported_balance: number | null
          state: string
          user_id: string
        }
        Insert: {
          account_id: string
          as_of: string
          created_at?: string
          derived_equity?: number | null
          difference?: number | null
          id?: string
          notes?: string | null
          reported_balance?: number | null
          state?: string
          user_id: string
        }
        Update: {
          account_id?: string
          as_of?: string
          created_at?: string
          derived_equity?: number | null
          difference?: number | null
          id?: string
          notes?: string | null
          reported_balance?: number | null
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_balance_reconciliations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_calculation_lineage: {
        Row: {
          calculation_run_id: string
          created_at: string
          exclusions: string[]
          id: string
          input_hash: string | null
          observations: Json
        }
        Insert: {
          calculation_run_id: string
          created_at?: string
          exclusions?: string[]
          id?: string
          input_hash?: string | null
          observations?: Json
        }
        Update: {
          calculation_run_id?: string
          created_at?: string
          exclusions?: string[]
          id?: string
          input_hash?: string | null
          observations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "journal_calculation_lineage_calculation_run_id_fkey"
            columns: ["calculation_run_id"]
            isOneToOne: false
            referencedRelation: "journal_calculation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_calculation_runs: {
        Row: {
          calculation_version: string
          created_at: string
          fees: number | null
          gross_pnl: number | null
          id: string
          initial_risk: number | null
          input_version: string
          net_pnl: number | null
          outcome: string | null
          over_exit_blocked: boolean
          plan_multiplier: number | null
          planned_quantity: number | null
          planned_risk_source: string | null
          r_multiple: number | null
          remaining_qty: number | null
          result: Json
          risk_per_share: number | null
          state: string
          trade_id: string
          user_id: string
          weighted_avg_entry: number | null
          weighted_avg_exit: number | null
        }
        Insert: {
          calculation_version?: string
          created_at?: string
          fees?: number | null
          gross_pnl?: number | null
          id?: string
          initial_risk?: number | null
          input_version?: string
          net_pnl?: number | null
          outcome?: string | null
          over_exit_blocked?: boolean
          plan_multiplier?: number | null
          planned_quantity?: number | null
          planned_risk_source?: string | null
          r_multiple?: number | null
          remaining_qty?: number | null
          result?: Json
          risk_per_share?: number | null
          state?: string
          trade_id: string
          user_id: string
          weighted_avg_entry?: number | null
          weighted_avg_exit?: number | null
        }
        Update: {
          calculation_version?: string
          created_at?: string
          fees?: number | null
          gross_pnl?: number | null
          id?: string
          initial_risk?: number | null
          input_version?: string
          net_pnl?: number | null
          outcome?: string | null
          over_exit_blocked?: boolean
          plan_multiplier?: number | null
          planned_quantity?: number | null
          planned_risk_source?: string | null
          r_multiple?: number | null
          remaining_qty?: number | null
          result?: Json
          risk_per_share?: number | null
          state?: string
          trade_id?: string
          user_id?: string
          weighted_avg_entry?: number | null
          weighted_avg_exit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_calculation_runs_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_cash_ledger_entries: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          currency: string
          entry_type: string
          external_id: string | null
          id: string
          memo: string | null
          occurred_at: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          currency?: string
          entry_type: string
          external_id?: string | null
          id?: string
          memo?: string | null
          occurred_at: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          currency?: string
          entry_type?: string
          external_id?: string | null
          id?: string
          memo?: string | null
          occurred_at?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_cash_ledger_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_cash_ledger_entries_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_coaching_commitments: {
        Row: {
          body: string | null
          created_at: string
          ends_on: string | null
          id: string
          starts_on: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          ends_on?: string | null
          id?: string
          starts_on?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_currency_conversions: {
        Row: {
          as_of: string
          created_at: string
          from_currency: string
          id: string
          rate: number
          source: string | null
          to_currency: string
          user_id: string
        }
        Insert: {
          as_of: string
          created_at?: string
          from_currency: string
          id?: string
          rate: number
          source?: string | null
          to_currency: string
          user_id: string
        }
        Update: {
          as_of?: string
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          source?: string | null
          to_currency?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_daily_metrics: {
        Row: {
          average_r: number | null
          breakevens: number
          created_at: string
          fees: number
          gross_pnl: number
          id: string
          losses: number
          metric_date: string
          net_pnl: number
          trade_count: number
          updated_at: string
          user_id: string
          wins: number
        }
        Insert: {
          average_r?: number | null
          breakevens?: number
          created_at?: string
          fees?: number
          gross_pnl?: number
          id?: string
          losses?: number
          metric_date: string
          net_pnl?: number
          trade_count?: number
          updated_at?: string
          user_id: string
          wins?: number
        }
        Update: {
          average_r?: number | null
          breakevens?: number
          created_at?: string
          fees?: number
          gross_pnl?: number
          id?: string
          losses?: number
          metric_date?: string
          net_pnl?: number
          trade_count?: number
          updated_at?: string
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      journal_daily_reviews: {
        Row: {
          body: string | null
          created_at: string
          followed_process: boolean | null
          grade: string | null
          id: string
          review_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          followed_process?: boolean | null
          grade?: string | null
          id?: string
          review_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          followed_process?: boolean | null
          grade?: string | null
          id?: string
          review_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_data_quality_issues: {
        Row: {
          created_at: string
          details: Json
          id: string
          issue_code: string
          resolved_at: string | null
          severity: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json
          id?: string
          issue_code: string
          resolved_at?: string | null
          severity?: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json
          id?: string
          issue_code?: string
          resolved_at?: string | null
          severity?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_data_quality_issues_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_dead_letters: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          payload: Json
          resolved_at: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          payload?: Json
          resolved_at?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      journal_domain_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      journal_equity_snapshots: {
        Row: {
          created_at: string
          cumulative_pnl: number
          id: string
          snapshot_date: string
          trade_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          cumulative_pnl?: number
          id?: string
          snapshot_date: string
          trade_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          cumulative_pnl?: number
          id?: string
          snapshot_date?: string
          trade_count?: number
          user_id?: string
        }
        Relationships: []
      }
      journal_event_outbox: {
        Row: {
          attempts: number
          created_at: string
          destination: string
          event_id: string | null
          id: string
          next_attempt_at: string | null
          payload: Json
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          destination: string
          event_id?: string | null
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          destination?: string
          event_id?: string | null
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_event_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "journal_domain_events"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_execution_fees: {
        Row: {
          account_currency_amount: number | null
          amount: number
          conversion_rate: number | null
          conversion_source: string | null
          conversion_timestamp: string | null
          created_at: string
          currency: string
          execution_id: string
          id: string
          kind: string
          native_amount: number | null
          native_currency: string | null
        }
        Insert: {
          account_currency_amount?: number | null
          amount: number
          conversion_rate?: number | null
          conversion_source?: string | null
          conversion_timestamp?: string | null
          created_at?: string
          currency?: string
          execution_id: string
          id?: string
          kind: string
          native_amount?: number | null
          native_currency?: string | null
        }
        Update: {
          account_currency_amount?: number | null
          amount?: number
          conversion_rate?: number | null
          conversion_source?: string | null
          conversion_timestamp?: string | null
          created_at?: string
          currency?: string
          execution_id?: string
          id?: string
          kind?: string
          native_amount?: number | null
          native_currency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_execution_fees_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "journal_executions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_executions: {
        Row: {
          action: string
          commission: number | null
          created_at: string
          external_execution_id: string | null
          fee_currency: string | null
          id: string
          idempotency_key: string | null
          import_job_id: string | null
          leg_id: string | null
          multiplier: number
          note: string | null
          occurred_at: string | null
          occurred_at_utc: string | null
          order_type: string | null
          other_fee: number | null
          price: number
          quantity: number
          regulatory_fee: number | null
          sequence_index: number
          source: string | null
          timezone: string | null
          trade_id: string
          venue: string | null
        }
        Insert: {
          action: string
          commission?: number | null
          created_at?: string
          external_execution_id?: string | null
          fee_currency?: string | null
          id?: string
          idempotency_key?: string | null
          import_job_id?: string | null
          leg_id?: string | null
          multiplier?: number
          note?: string | null
          occurred_at?: string | null
          occurred_at_utc?: string | null
          order_type?: string | null
          other_fee?: number | null
          price: number
          quantity: number
          regulatory_fee?: number | null
          sequence_index?: number
          source?: string | null
          timezone?: string | null
          trade_id: string
          venue?: string | null
        }
        Update: {
          action?: string
          commission?: number | null
          created_at?: string
          external_execution_id?: string | null
          fee_currency?: string | null
          id?: string
          idempotency_key?: string | null
          import_job_id?: string | null
          leg_id?: string | null
          multiplier?: number
          note?: string | null
          occurred_at?: string | null
          occurred_at_utc?: string | null
          order_type?: string | null
          other_fee?: number | null
          price?: number
          quantity?: number
          regulatory_fee?: number | null
          sequence_index?: number
          source?: string | null
          timezone?: string | null
          trade_id?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_executions_leg_id_fkey"
            columns: ["leg_id"]
            isOneToOne: false
            referencedRelation: "journal_trade_legs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_executions_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_goals: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          max_daily_loss: number | null
          max_drawdown: number | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          period_type: string
          status: string
          target_pnl: number | null
          target_r: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          max_daily_loss?: number | null
          max_drawdown?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string
          status?: string
          target_pnl?: number | null
          target_r?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          max_daily_loss?: number | null
          max_drawdown?: number | null
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          period_type?: string
          status?: string
          target_pnl?: number | null
          target_r?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_goals_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_import_jobs: {
        Row: {
          created_at: string
          duplicate_count: number
          error_message: string | null
          failed_count: number
          filename: string | null
          finished_at: string | null
          id: string
          imported_count: number
          invalid_count: number
          row_count: number | null
          source: string
          started_at: string | null
          status: string
          total_count: number
          user_id: string
          valid_count: number
        }
        Insert: {
          created_at?: string
          duplicate_count?: number
          error_message?: string | null
          failed_count?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          imported_count?: number
          invalid_count?: number
          row_count?: number | null
          source?: string
          started_at?: string | null
          status?: string
          total_count?: number
          user_id: string
          valid_count?: number
        }
        Update: {
          created_at?: string
          duplicate_count?: number
          error_message?: string | null
          failed_count?: number
          filename?: string | null
          finished_at?: string | null
          id?: string
          imported_count?: number
          invalid_count?: number
          row_count?: number | null
          source?: string
          started_at?: string | null
          status?: string
          total_count?: number
          user_id?: string
          valid_count?: number
        }
        Relationships: []
      }
      journal_import_mappings: {
        Row: {
          broker: string
          created_at: string
          id: string
          mapping: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          broker: string
          created_at?: string
          id?: string
          mapping?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string
          created_at?: string
          id?: string
          mapping?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_import_rows: {
        Row: {
          created_execution_id: string | null
          created_trade_id: string | null
          error_code: string | null
          error_message: string | null
          external_id: string | null
          id: string
          identity_key: string | null
          import_job_id: string
          parsed: Json | null
          prior_trade_id: string | null
          raw: Json | null
          row_index: number
          status: string
        }
        Insert: {
          created_execution_id?: string | null
          created_trade_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          identity_key?: string | null
          import_job_id: string
          parsed?: Json | null
          prior_trade_id?: string | null
          raw?: Json | null
          row_index: number
          status?: string
        }
        Update: {
          created_execution_id?: string | null
          created_trade_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          identity_key?: string | null
          import_job_id?: string
          parsed?: Json | null
          prior_trade_id?: string | null
          raw?: Json | null
          row_index?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_import_rows_created_execution_id_fkey"
            columns: ["created_execution_id"]
            isOneToOne: false
            referencedRelation: "journal_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_import_rows_created_trade_id_fkey"
            columns: ["created_trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_import_rows_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "journal_import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_imports: {
        Row: {
          broker: string | null
          error_message: string | null
          filename: string | null
          id: string
          imported_at: string
          row_count: number | null
          status: string
          user_id: string
        }
        Insert: {
          broker?: string | null
          error_message?: string | null
          filename?: string | null
          id?: string
          imported_at?: string
          row_count?: number | null
          status?: string
          user_id: string
        }
        Update: {
          broker?: string | null
          error_message?: string | null
          filename?: string | null
          id?: string
          imported_at?: string
          row_count?: number | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_integrations: {
        Row: {
          created_at: string
          id: string
          provider: string
          settings: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          settings?: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          settings?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_market_context: {
        Row: {
          as_of: string
          created_at: string
          id: string
          payload: Json
          symbol: string | null
          user_id: string
        }
        Insert: {
          as_of: string
          created_at?: string
          id?: string
          payload?: Json
          symbol?: string | null
          user_id: string
        }
        Update: {
          as_of?: string
          created_at?: string
          id?: string
          payload?: Json
          symbol?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_market_context_sources: {
        Row: {
          captured_at: string
          id: string
          market_context_id: string
          source_name: string
          source_url: string | null
        }
        Insert: {
          captured_at?: string
          id?: string
          market_context_id: string
          source_name: string
          source_url?: string | null
        }
        Update: {
          captured_at?: string
          id?: string
          market_context_id?: string
          source_name?: string
          source_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_market_context_sources_market_context_id_fkey"
            columns: ["market_context_id"]
            isOneToOne: false
            referencedRelation: "journal_market_context"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_metric_definitions: {
        Row: {
          category: string | null
          created_at: string
          definition_en: string
          definition_es: string
          id: string
          metric_key: string
          name_en: string
          name_es: string
          unit: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          definition_en: string
          definition_es: string
          id?: string
          metric_key: string
          name_en: string
          name_es: string
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          definition_en?: string
          definition_es?: string
          id?: string
          metric_key?: string
          name_en?: string
          name_es?: string
          unit?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      journal_metric_formula_versions: {
        Row: {
          created_at: string
          expression: string | null
          formula_version: string
          id: string
          metric_definition_id: string
        }
        Insert: {
          created_at?: string
          expression?: string | null
          formula_version: string
          id?: string
          metric_definition_id: string
        }
        Update: {
          created_at?: string
          expression?: string | null
          formula_version?: string
          id?: string
          metric_definition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_metric_formula_versions_metric_definition_id_fkey"
            columns: ["metric_definition_id"]
            isOneToOne: false
            referencedRelation: "journal_metric_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_notebook_entries: {
        Row: {
          body: string | null
          created_at: string
          entry_date: string | null
          id: string
          notebook_id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entry_date?: string | null
          id?: string
          notebook_id: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entry_date?: string | null
          id?: string
          notebook_id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_notebook_entries_notebook_id_fkey"
            columns: ["notebook_id"]
            isOneToOne: false
            referencedRelation: "journal_notebooks"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_notebook_links: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          playbook_id: string | null
          trade_id: string | null
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          playbook_id?: string | null
          trade_id?: string | null
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          playbook_id?: string | null
          trade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_notebook_links_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_notebook_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_notebook_links_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_notebooks: {
        Row: {
          created_at: string
          id: string
          kind: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_notes: {
        Row: {
          body: string
          created_at: string
          id: string
          note_type: string
          trade_id: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          note_type?: string
          trade_id: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          note_type?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_notes_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_performance_insights: {
        Row: {
          body: string | null
          created_at: string
          generated_at: string
          id: string
          insight_type: string
          payload: Json
          title: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          insight_type: string
          payload?: Json
          title?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          generated_at?: string
          id?: string
          insight_type?: string
          payload?: Json
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      journal_playbook_check_results: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          passed: boolean | null
          rule_id: string
          trade_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          passed?: boolean | null
          rule_id: string
          trade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          passed?: boolean | null
          rule_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_playbook_check_results_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "journal_playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_playbook_check_results_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_playbook_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_required: boolean
          playbook_id: string
          rule_key: string
          user_id: string
          version_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          playbook_id: string
          rule_key: string
          user_id: string
          version_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean
          playbook_id?: string
          rule_key?: string
          user_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_playbook_rules_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "journal_playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_playbook_rules_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "journal_playbook_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_playbook_versions: {
        Row: {
          created_at: string
          id: string
          playbook_id: string
          rules_snapshot: Json
          user_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          playbook_id: string
          rules_snapshot?: Json
          user_id: string
          version_number?: number
        }
        Update: {
          created_at?: string
          id?: string
          playbook_id?: string
          rules_snapshot?: Json
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_playbook_versions_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "journal_playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_playbooks: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_price_observations: {
        Row: {
          created_at: string
          id: string
          observed_at: string
          price: number
          source: string | null
          symbol: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observed_at: string
          price: number
          source?: string | null
          symbol: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observed_at?: string
          price?: number
          source?: string | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_process_score_components: {
        Row: {
          applicable: boolean
          component_key: string
          created_at: string
          id: string
          process_score_id: string
          reason: string | null
          score: number | null
          weight: number | null
        }
        Insert: {
          applicable?: boolean
          component_key: string
          created_at?: string
          id?: string
          process_score_id: string
          reason?: string | null
          score?: number | null
          weight?: number | null
        }
        Update: {
          applicable?: boolean
          component_key?: string
          created_at?: string
          id?: string
          process_score_id?: string
          reason?: string | null
          score?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_process_score_components_process_score_id_fkey"
            columns: ["process_score_id"]
            isOneToOne: false
            referencedRelation: "journal_process_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_process_scores: {
        Row: {
          confidence: string | null
          created_at: string
          id: string
          review_date: string | null
          session_id: string | null
          state: string | null
          total: number | null
          trade_id: string | null
          user_id: string
          version: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          id?: string
          review_date?: string | null
          session_id?: string | null
          state?: string | null
          total?: number | null
          trade_id?: string | null
          user_id: string
          version?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          id?: string
          review_date?: string | null
          session_id?: string | null
          state?: string | null
          total?: number | null
          trade_id?: string | null
          user_id?: string
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_process_scores_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "journal_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_process_scores_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_provider_accounts: {
        Row: {
          account_id: string | null
          created_at: string
          display_name: string | null
          external_account_id: string
          id: string
          integration_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          display_name?: string | null
          external_account_id: string
          id?: string
          integration_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          display_name?: string | null
          external_account_id?: string
          id?: string
          integration_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_provider_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_provider_accounts_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "journal_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_report_exports: {
        Row: {
          created_at: string
          format: string
          id: string
          report_run_id: string | null
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          format?: string
          id?: string
          report_run_id?: string | null
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          report_run_id?: string | null
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_report_exports_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "journal_report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_report_run_rows: {
        Row: {
          id: string
          payload: Json
          report_run_id: string
          row_index: number
        }
        Insert: {
          id?: string
          payload?: Json
          report_run_id: string
          row_index: number
        }
        Update: {
          id?: string
          payload?: Json
          report_run_id?: string
          row_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "journal_report_run_rows_report_run_id_fkey"
            columns: ["report_run_id"]
            isOneToOne: false
            referencedRelation: "journal_report_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_report_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          saved_report_id: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          saved_report_id?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          saved_report_id?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_report_runs_saved_report_id_fkey"
            columns: ["saved_report_id"]
            isOneToOne: false
            referencedRelation: "journal_saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_report_schedules: {
        Row: {
          created_at: string
          cron: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          saved_report_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          cron?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          saved_report_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          cron?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          saved_report_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_report_schedules_saved_report_id_fkey"
            columns: ["saved_report_id"]
            isOneToOne: false
            referencedRelation: "journal_saved_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_report_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          template: Json
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          template?: Json
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          template?: Json
          user_id?: string | null
        }
        Relationships: []
      }
      journal_risk_rules: {
        Row: {
          account_id: string | null
          created_at: string
          id: string
          is_active: boolean
          params: Json
          rule_key: string
          rule_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          params?: Json
          rule_key: string
          rule_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          params?: Json
          rule_key?: string
          rule_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_risk_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_risk_violations: {
        Row: {
          account_id: string | null
          created_at: string
          details: Json
          id: string
          occurred_at: string
          rule_id: string | null
          severity: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          occurred_at?: string
          rule_id?: string | null
          severity?: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          occurred_at?: string
          rule_id?: string | null
          severity?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_risk_violations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_risk_violations_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "journal_risk_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_risk_violations_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_saved_reports: {
        Row: {
          created_at: string
          id: string
          name: string
          params: Json
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          params?: Json
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          params?: Json
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_saved_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "journal_report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_sessions: {
        Row: {
          account_id: string | null
          created_at: string
          ended_at: string | null
          id: string
          notes: string | null
          session_date: string
          started_at: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          session_date: string
          started_at?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          notes?: string | null
          session_date?: string
          started_at?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_sessions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_stats_cache: {
        Row: {
          avg_loss_dollars: number | null
          avg_win_dollars: number | null
          id: string
          largest_loss: number | null
          largest_win: number | null
          losses: number
          period_end: string | null
          period_start: string | null
          total_pnl: number | null
          total_trades: number
          updated_at: string
          user_id: string
          wash_trades: number
          win_rate: number | null
          wins: number
        }
        Insert: {
          avg_loss_dollars?: number | null
          avg_win_dollars?: number | null
          id?: string
          largest_loss?: number | null
          largest_win?: number | null
          losses?: number
          period_end?: string | null
          period_start?: string | null
          total_pnl?: number | null
          total_trades?: number
          updated_at?: string
          user_id: string
          wash_trades?: number
          win_rate?: number | null
          wins?: number
        }
        Update: {
          avg_loss_dollars?: number | null
          avg_win_dollars?: number | null
          id?: string
          largest_loss?: number | null
          largest_win?: number | null
          losses?: number
          period_end?: string | null
          period_start?: string | null
          total_pnl?: number | null
          total_trades?: number
          updated_at?: string
          user_id?: string
          wash_trades?: number
          win_rate?: number | null
          wins?: number
        }
        Relationships: []
      }
      journal_sync_cursors: {
        Row: {
          cursor_key: string
          cursor_value: string | null
          id: string
          integration_id: string
          updated_at: string
        }
        Insert: {
          cursor_key: string
          cursor_value?: string | null
          id?: string
          integration_id: string
          updated_at?: string
        }
        Update: {
          cursor_key?: string
          cursor_value?: string | null
          id?: string
          integration_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_sync_cursors_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "journal_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_tag_assignments: {
        Row: {
          created_at: string
          id: string
          tag_id: string
          trade_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tag_id: string
          trade_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tag_id?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "journal_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_tag_assignments_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_trade_cash_flows: {
        Row: {
          amount: number
          created_at: string
          currency: string
          flow_type: string
          id: string
          occurred_at: string
          trade_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          flow_type: string
          id?: string
          occurred_at: string
          trade_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          flow_type?: string
          id?: string
          occurred_at?: string
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_cash_flows_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_context: {
        Row: {
          captured_at: string
          created_at: string
          id: string
          snapshot: Json
          trade_id: string | null
          user_id: string
        }
        Insert: {
          captured_at?: string
          created_at?: string
          id?: string
          snapshot?: Json
          trade_id?: string | null
          user_id: string
        }
        Update: {
          captured_at?: string
          created_at?: string
          id?: string
          snapshot?: Json
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_context_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_legs: {
        Row: {
          action: string
          contracts: number | null
          created_at: string
          expiration: string | null
          id: string
          multiplier: number
          occ_symbol: string | null
          right: string | null
          sequence_index: number
          status: string
          strike: number | null
          trade_id: string
        }
        Insert: {
          action: string
          contracts?: number | null
          created_at?: string
          expiration?: string | null
          id?: string
          multiplier?: number
          occ_symbol?: string | null
          right?: string | null
          sequence_index?: number
          status?: string
          strike?: number | null
          trade_id: string
        }
        Update: {
          action?: string
          contracts?: number | null
          created_at?: string
          expiration?: string | null
          id?: string
          multiplier?: number
          occ_symbol?: string | null
          right?: string | null
          sequence_index?: number
          status?: string
          strike?: number | null
          trade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_legs_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_markers: {
        Row: {
          created_at: string
          id: string
          marker_type: string
          note: string | null
          occurred_at: string | null
          price: number | null
          trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          marker_type: string
          note?: string | null
          occurred_at?: string | null
          price?: number | null
          trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          marker_type?: string
          note?: string | null
          occurred_at?: string | null
          price?: number | null
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_markers_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_plans: {
        Row: {
          created_at: string
          id: string
          planned_entry: number | null
          planned_risk: number | null
          planned_size: number | null
          planned_stop: number | null
          planned_target: number | null
          thesis: string | null
          trade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          planned_entry?: number | null
          planned_risk?: number | null
          planned_size?: number | null
          planned_stop?: number | null
          planned_target?: number | null
          thesis?: string | null
          trade_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          planned_entry?: number | null
          planned_risk?: number | null
          planned_size?: number | null
          planned_stop?: number | null
          planned_target?: number | null
          thesis?: string | null
          trade_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_plans_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_relationships: {
        Row: {
          created_at: string
          from_trade_id: string
          id: string
          relationship_type: string
          to_trade_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_trade_id: string
          id?: string
          relationship_type: string
          to_trade_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_trade_id?: string
          id?: string
          relationship_type?: string
          to_trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_relationships_from_trade_id_fkey"
            columns: ["from_trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_trade_relationships_to_trade_id_fkey"
            columns: ["to_trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_reviews: {
        Row: {
          body: string | null
          created_at: string
          emotions: string | null
          followed_plan: boolean | null
          id: string
          lessons: string | null
          rating: number | null
          reviewed_at: string
          trade_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          emotions?: string | null
          followed_plan?: boolean | null
          id?: string
          lessons?: string | null
          rating?: number | null
          reviewed_at?: string
          trade_id: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          emotions?: string | null
          followed_plan?: boolean | null
          id?: string
          lessons?: string | null
          rating?: number | null
          reviewed_at?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_reviews_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trade_sequence_metrics: {
        Row: {
          created_at: string
          id: string
          payload: Json
          trade_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          trade_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          trade_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_trade_sequence_metrics_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: true
            referencedRelation: "journal_trades"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_trader_profiles: {
        Row: {
          created_at: string
          default_currency: string
          default_timezone: string
          display_name: string | null
          experience_level: string | null
          id: string
          locale: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          default_currency?: string
          default_timezone?: string
          display_name?: string | null
          experience_level?: string | null
          id?: string
          locale?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          default_currency?: string
          default_timezone?: string
          display_name?: string | null
          experience_level?: string | null
          id?: string
          locale?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_trades: {
        Row: {
          account_id: string | null
          archived_at: string | null
          asset_class: string | null
          calculation_version: string | null
          context_snapshot_id: string | null
          created_at: string
          demo_forbidden: boolean
          direction: string | null
          discovery_source: string | null
          entry_date: string
          entry_price: number
          exit_date: string | null
          exit_price: number | null
          hold_duration_minutes: number | null
          id: string
          import_job_id: string | null
          instrument: string | null
          is_wash: boolean
          lifecycle_status: string | null
          parent_trade_id: string | null
          planned_entry: number | null
          planned_risk: number | null
          planned_size: number | null
          planned_stop: number | null
          planned_target: number | null
          playbook_id: string | null
          playbook_version_id: string | null
          qty: number
          return_dollars: number | null
          return_pct: number | null
          reviewed_at: string | null
          session_date: string | null
          setup_tag: string | null
          side: string
          source: string
          status: string
          stop_price: number | null
          symbol: string
          target_price: number | null
          thesis: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          archived_at?: string | null
          asset_class?: string | null
          calculation_version?: string | null
          context_snapshot_id?: string | null
          created_at?: string
          demo_forbidden?: boolean
          direction?: string | null
          discovery_source?: string | null
          entry_date: string
          entry_price: number
          exit_date?: string | null
          exit_price?: number | null
          hold_duration_minutes?: number | null
          id?: string
          import_job_id?: string | null
          instrument?: string | null
          is_wash?: boolean
          lifecycle_status?: string | null
          parent_trade_id?: string | null
          planned_entry?: number | null
          planned_risk?: number | null
          planned_size?: number | null
          planned_stop?: number | null
          planned_target?: number | null
          playbook_id?: string | null
          playbook_version_id?: string | null
          qty: number
          return_dollars?: number | null
          return_pct?: number | null
          reviewed_at?: string | null
          session_date?: string | null
          setup_tag?: string | null
          side: string
          source?: string
          status?: string
          stop_price?: number | null
          symbol: string
          target_price?: number | null
          thesis?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          archived_at?: string | null
          asset_class?: string | null
          calculation_version?: string | null
          context_snapshot_id?: string | null
          created_at?: string
          demo_forbidden?: boolean
          direction?: string | null
          discovery_source?: string | null
          entry_date?: string
          entry_price?: number
          exit_date?: string | null
          exit_price?: number | null
          hold_duration_minutes?: number | null
          id?: string
          import_job_id?: string | null
          instrument?: string | null
          is_wash?: boolean
          lifecycle_status?: string | null
          parent_trade_id?: string | null
          planned_entry?: number | null
          planned_risk?: number | null
          planned_size?: number | null
          planned_stop?: number | null
          planned_target?: number | null
          playbook_id?: string | null
          playbook_version_id?: string | null
          qty?: number
          return_dollars?: number | null
          return_pct?: number | null
          reviewed_at?: string | null
          session_date?: string | null
          setup_tag?: string | null
          side?: string
          source?: string
          status?: string
          stop_price?: number | null
          symbol?: string
          target_price?: number | null
          thesis?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      journal_valuation_snapshots: {
        Row: {
          account_id: string | null
          as_of: string
          created_at: string
          currency: string
          equity: number | null
          id: string
          open_pnl: number | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          as_of: string
          created_at?: string
          currency?: string
          equity?: number | null
          id?: string
          open_pnl?: number | null
          user_id: string
        }
        Update: {
          account_id?: string | null
          as_of?: string
          created_at?: string
          currency?: string
          equity?: number | null
          id?: string
          open_pnl?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_valuation_snapshots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "journal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_webhook_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          error_message: string | null
          id: string
          payload_hash: string | null
          status: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          error_message?: string | null
          id?: string
          payload_hash?: string | null
          status: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          error_message?: string | null
          id?: string
          payload_hash?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "journal_webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_webhook_endpoints: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      market_indexes: {
        Row: {
          change_amount: number | null
          change_percent: number | null
          current_value: number | null
          id: string
          name: string
          sparkline_data: Json | null
          symbol: string
          updated_at: string | null
        }
        Insert: {
          change_amount?: number | null
          change_percent?: number | null
          current_value?: number | null
          id?: string
          name: string
          sparkline_data?: Json | null
          symbol: string
          updated_at?: string | null
        }
        Update: {
          change_amount?: number | null
          change_percent?: number | null
          current_value?: number | null
          id?: string
          name?: string
          sparkline_data?: Json | null
          symbol?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      market_movers: {
        Row: {
          change_percent: number | null
          id: string
          name: string
          price: number | null
          session_date: string | null
          symbol: string
          type: string | null
          updated_at: string | null
          volume: number | null
        }
        Insert: {
          change_percent?: number | null
          id?: string
          name: string
          price?: number | null
          session_date?: string | null
          symbol: string
          type?: string | null
          updated_at?: string | null
          volume?: number | null
        }
        Update: {
          change_percent?: number | null
          id?: string
          name?: string
          price?: number | null
          session_date?: string | null
          symbol?: string
          type?: string | null
          updated_at?: string | null
          volume?: number | null
        }
        Relationships: []
      }
      market_news: {
        Row: {
          category: string | null
          description: string | null
          headline: string
          id: string
          image_url: string | null
          published_at: string | null
          publisher_favicon: string | null
          source: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          headline: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          publisher_favicon?: string | null
          source?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          headline?: string
          id?: string
          image_url?: string | null
          published_at?: string | null
          publisher_favicon?: string | null
          source?: string | null
          url?: string | null
        }
        Relationships: []
      }
      market_session_calendar: {
        Row: {
          after_hours_end_et: string
          holiday_name: string | null
          market_status: string
          provider_as_of: string
          regular_close_et: string
          regular_open_et: string
          session_date: string
          source: string
          updated_at: string
        }
        Insert: {
          after_hours_end_et: string
          holiday_name?: string | null
          market_status: string
          provider_as_of: string
          regular_close_et: string
          regular_open_et: string
          session_date: string
          source: string
          updated_at: string
        }
        Update: {
          after_hours_end_et?: string
          holiday_name?: string | null
          market_status?: string
          provider_as_of?: string
          regular_close_et?: string
          regular_open_et?: string
          session_date?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          email: string
          id: string
          source: string | null
          subscribed_at: string | null
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          current_period_end: string | null
          email: string | null
          full_name: string | null
          id: string
          plan: string | null
          preferred_language: string | null
          preferred_theme: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          plan?: string | null
          preferred_language?: string | null
          preferred_theme?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          current_period_end?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          plan?: string | null
          preferred_language?: string | null
          preferred_theme?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      radar_v22_archive: {
        Row: {
          archived_at: string
          generation_id: string | null
          lifecycle: string
          peak_volume_15s: number | null
          provider_as_of: string | null
          rolling_volume_15s: number | null
          rolling_volume_60s: number | null
          session_date: string
          session_volume: number | null
          symbol: string
        }
        Insert: {
          archived_at: string
          generation_id?: string | null
          lifecycle: string
          peak_volume_15s?: number | null
          provider_as_of?: string | null
          rolling_volume_15s?: number | null
          rolling_volume_60s?: number | null
          session_date: string
          session_volume?: number | null
          symbol: string
        }
        Update: {
          archived_at?: string
          generation_id?: string | null
          lifecycle?: string
          peak_volume_15s?: number | null
          provider_as_of?: string | null
          rolling_volume_15s?: number | null
          rolling_volume_60s?: number | null
          session_date?: string
          session_volume?: number | null
          symbol?: string
        }
        Relationships: []
      }
      radar_v22_board: {
        Row: {
          acceleration_5m: number | null
          change_percent: number
          company_name: string | null
          day_high: number
          day_low: number
          generation_id: string
          lifecycle: string
          peak_volume_15s: number | null
          price: number
          prior_session_volume: number
          provider_as_of: string
          rank: number
          rolling_dollar_volume_60s: number
          rolling_volume_15s: number
          rolling_volume_5s: number
          rolling_volume_60s: number
          session_vwap: number | null
          signal_status: string
          symbol: string
          updated_at: string
          volume: number
          volume_ratio_prior_session: number
        }
        Insert: {
          acceleration_5m?: number | null
          change_percent: number
          company_name?: string | null
          day_high: number
          day_low: number
          generation_id: string
          lifecycle: string
          peak_volume_15s?: number | null
          price: number
          prior_session_volume: number
          provider_as_of: string
          rank: number
          rolling_dollar_volume_60s: number
          rolling_volume_15s: number
          rolling_volume_5s: number
          rolling_volume_60s: number
          session_vwap?: number | null
          signal_status: string
          symbol: string
          updated_at: string
          volume: number
          volume_ratio_prior_session: number
        }
        Update: {
          acceleration_5m?: number | null
          change_percent?: number
          company_name?: string | null
          day_high?: number
          day_low?: number
          generation_id?: string
          lifecycle?: string
          peak_volume_15s?: number | null
          price?: number
          prior_session_volume?: number
          provider_as_of?: string
          rank?: number
          rolling_dollar_volume_60s?: number
          rolling_volume_15s?: number
          rolling_volume_5s?: number
          rolling_volume_60s?: number
          session_vwap?: number | null
          signal_status?: string
          symbol?: string
          updated_at?: string
          volume?: number
          volume_ratio_prior_session?: number
        }
        Relationships: []
      }
      radar_v22_feed_state: {
        Row: {
          feed_stale: boolean
          generation_id: string | null
          last_provider_event_at: string | null
          provider_as_of_max: string | null
          provider_as_of_min: string | null
          session_date: string | null
          state_key: string
          status: string
          symbol_count: number
          synced_at: string
          updated_at: string
        }
        Insert: {
          feed_stale?: boolean
          generation_id?: string | null
          last_provider_event_at?: string | null
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          session_date?: string | null
          state_key: string
          status: string
          symbol_count?: number
          synced_at: string
          updated_at: string
        }
        Update: {
          feed_stale?: boolean
          generation_id?: string | null
          last_provider_event_at?: string | null
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          session_date?: string | null
          state_key?: string
          status?: string
          symbol_count?: number
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      radar_v22_lease: {
        Row: {
          expires_at: string
          heartbeat_at: string
          holder_id: string
          lease_key: string
        }
        Insert: {
          expires_at: string
          heartbeat_at: string
          holder_id: string
          lease_key: string
        }
        Update: {
          expires_at?: string
          heartbeat_at?: string
          holder_id?: string
          lease_key?: string
        }
        Relationships: []
      }
      screener_52w_baseline_job: {
        Row: {
          dates_applied: number
          dates_total: number
          generation_id: string
          job_key: string
          last_applied_date: string | null
          period_end: string
          period_start: string
          provider_as_of: string
          status: string
          updated_at: string
        }
        Insert: {
          dates_applied: number
          dates_total: number
          generation_id: string
          job_key: string
          last_applied_date?: string | null
          period_end: string
          period_start: string
          provider_as_of: string
          status: string
          updated_at: string
        }
        Update: {
          dates_applied?: number
          dates_total?: number
          generation_id?: string
          job_key?: string
          last_applied_date?: string | null
          period_end?: string
          period_start?: string
          provider_as_of?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      screener_52w_baseline_job_dates: {
        Row: {
          generation_id: string
          session_date: string
        }
        Insert: {
          generation_id: string
          session_date: string
        }
        Update: {
          generation_id?: string
          session_date?: string
        }
        Relationships: []
      }
      screener_52w_baseline_staging: {
        Row: {
          generation_id: string
          high_52w: number
          high_date: string
          low_52w: number
          low_date: string
          sessions_observed: number
          symbol: string
        }
        Insert: {
          generation_id: string
          high_52w: number
          high_date: string
          low_52w: number
          low_date: string
          sessions_observed: number
          symbol: string
        }
        Update: {
          generation_id?: string
          high_52w?: number
          high_date?: string
          low_52w?: number
          low_date?: string
          sessions_observed?: number
          symbol?: string
        }
        Relationships: []
      }
      screener_52w_baseline_state: {
        Row: {
          current_generation_id: string | null
          period_end: string | null
          period_start: string | null
          provider_as_of: string | null
          state_key: string
          status: string
          symbol_count: number
          updated_at: string
        }
        Insert: {
          current_generation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          provider_as_of?: string | null
          state_key: string
          status: string
          symbol_count: number
          updated_at: string
        }
        Update: {
          current_generation_id?: string | null
          period_end?: string | null
          period_start?: string | null
          provider_as_of?: string | null
          state_key?: string
          status?: string
          symbol_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      screener_52w_baselines: {
        Row: {
          generation_id: string
          high_52w: number
          high_candidates: Json
          low_52w: number
          low_candidates: Json
          period_end: string
          period_start: string
          provider_as_of: string
          sessions_observed: number
          symbol: string
          updated_at: string
        }
        Insert: {
          generation_id: string
          high_52w: number
          high_candidates: Json
          low_52w: number
          low_candidates: Json
          period_end: string
          period_start: string
          provider_as_of: string
          sessions_observed: number
          symbol: string
          updated_at: string
        }
        Update: {
          generation_id?: string
          high_52w?: number
          high_candidates?: Json
          low_52w?: number
          low_candidates?: Json
          period_end?: string
          period_start?: string
          provider_as_of?: string
          sessions_observed?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: []
      }
      screener_feed_state: {
        Row: {
          nhl_baseline_status: string | null
          provider_as_of_max: string | null
          provider_as_of_min: string | null
          rows_inserted: number
          state_key: string
          status: string
          sync_run_id: string
          synced_at: string
          tab_counts: Json
          updated_at: string
        }
        Insert: {
          nhl_baseline_status?: string | null
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          rows_inserted: number
          state_key: string
          status: string
          sync_run_id: string
          synced_at: string
          tab_counts: Json
          updated_at: string
        }
        Update: {
          nhl_baseline_status?: string | null
          provider_as_of_max?: string | null
          provider_as_of_min?: string | null
          rows_inserted?: number
          state_key?: string
          status?: string
          sync_run_id?: string
          synced_at?: string
          tab_counts?: Json
          updated_at?: string
        }
        Relationships: []
      }
      screener_results: {
        Row: {
          avg_volume: number | null
          change_percent: number | null
          company_name: string | null
          day_high: number | null
          day_low: number | null
          float_shares: number | null
          gap_percent: number | null
          high_52w: number | null
          id: string
          low_52w: number | null
          market_cap: number | null
          price: number | null
          prior_session_volume: number | null
          provider_as_of: string | null
          range_event: string | null
          rvol: number | null
          symbol: string
          sync_run_id: string | null
          tab_id: string
          updated_at: string | null
          volume: number | null
          volume_ratio_prior_session: number | null
        }
        Insert: {
          avg_volume?: number | null
          change_percent?: number | null
          company_name?: string | null
          day_high?: number | null
          day_low?: number | null
          float_shares?: number | null
          gap_percent?: number | null
          high_52w?: number | null
          id?: string
          low_52w?: number | null
          market_cap?: number | null
          price?: number | null
          prior_session_volume?: number | null
          provider_as_of?: string | null
          range_event?: string | null
          rvol?: number | null
          symbol: string
          sync_run_id?: string | null
          tab_id: string
          updated_at?: string | null
          volume?: number | null
          volume_ratio_prior_session?: number | null
        }
        Update: {
          avg_volume?: number | null
          change_percent?: number | null
          company_name?: string | null
          day_high?: number | null
          day_low?: number | null
          float_shares?: number | null
          gap_percent?: number | null
          high_52w?: number | null
          id?: string
          low_52w?: number | null
          market_cap?: number | null
          price?: number | null
          prior_session_volume?: number | null
          provider_as_of?: string | null
          range_event?: string | null
          rvol?: number | null
          symbol?: string
          sync_run_id?: string | null
          tab_id?: string
          updated_at?: string | null
          volume?: number | null
          volume_ratio_prior_session?: number | null
        }
        Relationships: []
      }
      stocks: {
        Row: {
          beta: number | null
          change_amount: number | null
          change_percent: number | null
          description: string | null
          eps: number | null
          exchange: string | null
          id: string
          industry: string | null
          logo_url: string | null
          market_cap: number | null
          name: string
          pe_ratio: number | null
          price: number | null
          revenue: number | null
          sector: string | null
          symbol: string
          updated_at: string | null
          volume: number | null
          website: string | null
          week_52_high: number | null
          week_52_low: number | null
        }
        Insert: {
          beta?: number | null
          change_amount?: number | null
          change_percent?: number | null
          description?: string | null
          eps?: number | null
          exchange?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          market_cap?: number | null
          name: string
          pe_ratio?: number | null
          price?: number | null
          revenue?: number | null
          sector?: string | null
          symbol: string
          updated_at?: string | null
          volume?: number | null
          website?: string | null
          week_52_high?: number | null
          week_52_low?: number | null
        }
        Update: {
          beta?: number | null
          change_amount?: number | null
          change_percent?: number | null
          description?: string | null
          eps?: number | null
          exchange?: string | null
          id?: string
          industry?: string | null
          logo_url?: string | null
          market_cap?: number | null
          name?: string
          pe_ratio?: number | null
          price?: number | null
          revenue?: number | null
          sector?: string | null
          symbol?: string
          updated_at?: string | null
          volume?: number | null
          website?: string | null
          week_52_high?: number | null
          week_52_low?: number | null
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string | null
          email: string
          id: string
          payment_customer_id: string | null
          payment_price_id: string | null
          payment_provider: string | null
          payment_subscription_id: string | null
          plan: string | null
          plan_period_end: string | null
          plan_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          payment_customer_id?: string | null
          payment_price_id?: string | null
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan?: string | null
          plan_period_end?: string | null
          plan_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          payment_customer_id?: string | null
          payment_price_id?: string | null
          payment_provider?: string | null
          payment_subscription_id?: string | null
          plan?: string | null
          plan_period_end?: string | null
          plan_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ticker_search: {
        Row: {
          active: boolean | null
          exchange: string | null
          id: string
          market: string | null
          market_cap: number | null
          name: string
          symbol: string
          type: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          exchange?: string | null
          id?: string
          market?: string | null
          market_cap?: number | null
          name: string
          symbol: string
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          exchange?: string | null
          id?: string
          market?: string | null
          market_cap?: number | null
          name?: string
          symbol?: string
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trade_tag_assignments: {
        Row: {
          id: string
          tag_id: string
          trade_id: string
          user_id: string
        }
        Insert: {
          id?: string
          tag_id: string
          trade_id: string
          user_id: string
        }
        Update: {
          id?: string
          tag_id?: string
          trade_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "trade_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_tag_assignments_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          confidence: number | null
          created_at: string
          emotion: number | null
          entry_date: string
          entry_price: number
          exit_date: string | null
          exit_price: number | null
          id: string
          notes: string | null
          pnl: number | null
          quantity: number
          setup_type: string | null
          side: string
          status: string
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          emotion?: number | null
          entry_date?: string
          entry_price: number
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          pnl?: number | null
          quantity: number
          setup_type?: string | null
          side: string
          status?: string
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          emotion?: number | null
          entry_date?: string
          entry_price?: number
          exit_date?: string | null
          exit_price?: number | null
          id?: string
          notes?: string | null
          pnl?: number | null
          quantity?: number
          setup_type?: string | null
          side?: string
          status?: string
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      watchlist_ai_alerts: {
        Row: {
          alert_type: string
          confidence: number | null
          created_at: string
          id: string
          reason: string
          reasoning: Json
          score_from: number | null
          score_to: number | null
          sentiment_from: string | null
          sentiment_to: string | null
          ticker: string
        }
        Insert: {
          alert_type: string
          confidence?: number | null
          created_at?: string
          id?: string
          reason: string
          reasoning?: Json
          score_from?: number | null
          score_to?: number | null
          sentiment_from?: string | null
          sentiment_to?: string | null
          ticker: string
        }
        Update: {
          alert_type?: string
          confidence?: number | null
          created_at?: string
          id?: string
          reason?: string
          reasoning?: Json
          score_from?: number | null
          score_to?: number | null
          sentiment_from?: string | null
          sentiment_to?: string | null
          ticker?: string
        }
        Relationships: []
      }
      watchlist_ai_analysis: {
        Row: {
          analyzed_at: string
          confidence: number
          hf_score: number
          hf_score_prev: number | null
          prev_analyzed_at: string | null
          reasoning: Json
          score_delta: number | null
          sentiment: string
          sentiment_prev: string | null
          signals: Json
          smart_tags: Json
          summary: string
          ticker: string
        }
        Insert: {
          analyzed_at?: string
          confidence: number
          hf_score: number
          hf_score_prev?: number | null
          prev_analyzed_at?: string | null
          reasoning?: Json
          score_delta?: number | null
          sentiment: string
          sentiment_prev?: string | null
          signals?: Json
          smart_tags?: Json
          summary: string
          ticker: string
        }
        Update: {
          analyzed_at?: string
          confidence?: number
          hf_score?: number
          hf_score_prev?: number | null
          prev_analyzed_at?: string | null
          reasoning?: Json
          score_delta?: number | null
          sentiment?: string
          sentiment_prev?: string | null
          signals?: Json
          smart_tags?: Json
          summary?: string
          ticker?: string
        }
        Relationships: []
      }
      watchlist_alerts_v2: {
        Row: {
          alert_type: string
          created_at: string
          dedupe_key: string
          event_time: string
          facts: Json
          id: string
          reason: string
          session_date: string | null
          ticker: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          dedupe_key: string
          event_time?: string
          facts?: Json
          id?: string
          reason: string
          session_date?: string | null
          ticker: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          dedupe_key?: string
          event_time?: string
          facts?: Json
          id?: string
          reason?: string
          session_date?: string | null
          ticker?: string
        }
        Relationships: []
      }
      watchlist_analysis_history: {
        Row: {
          analyzed_at: string
          direction: Database["public"]["Enums"]["watchlist_direction"]
          explanation: string
          id: string
          market_signals: Json
          run_id: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["watchlist_session"]
          ticker: string
        }
        Insert: {
          analyzed_at?: string
          direction: Database["public"]["Enums"]["watchlist_direction"]
          explanation: string
          id?: string
          market_signals?: Json
          run_id?: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["watchlist_session"]
          ticker: string
        }
        Update: {
          analyzed_at?: string
          direction?: Database["public"]["Enums"]["watchlist_direction"]
          explanation?: string
          id?: string
          market_signals?: Json
          run_id?: string | null
          session_date?: string
          session_type?: Database["public"]["Enums"]["watchlist_session"]
          ticker?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_analysis_history_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "watchlist_analysis_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      watchlist_analysis_requests: {
        Row: {
          completed_at: string | null
          error_code: string | null
          id: string
          requested_at: string
          source: string
          status: string
          ticker: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          id?: string
          requested_at?: string
          source: string
          status?: string
          ticker: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          id?: string
          requested_at?: string
          source?: string
          status?: string
          ticker?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_analysis_runs: {
        Row: {
          cursor_end: string | null
          cursor_start: string | null
          finished_at: string | null
          mode: string
          reason_codes: Json
          run_id: string
          session_type: Database["public"]["Enums"]["watchlist_session"] | null
          started_at: string
          status: string
          tickers_error: number
          tickers_ok: number
          tickers_total: number
          tickers_unavailable: number
        }
        Insert: {
          cursor_end?: string | null
          cursor_start?: string | null
          finished_at?: string | null
          mode: string
          reason_codes?: Json
          run_id?: string
          session_type?: Database["public"]["Enums"]["watchlist_session"] | null
          started_at?: string
          status: string
          tickers_error?: number
          tickers_ok?: number
          tickers_total?: number
          tickers_unavailable?: number
        }
        Update: {
          cursor_end?: string | null
          cursor_start?: string | null
          finished_at?: string | null
          mode?: string
          reason_codes?: Json
          run_id?: string
          session_type?: Database["public"]["Enums"]["watchlist_session"] | null
          started_at?: string
          status?: string
          tickers_error?: number
          tickers_ok?: number
          tickers_total?: number
          tickers_unavailable?: number
        }
        Relationships: []
      }
      watchlist_analysis_v2: {
        Row: {
          analyzed_at: string
          change_pct: number | null
          contract_version: number
          direction: Database["public"]["Enums"]["watchlist_direction"]
          driver_ids: Json
          explanation: string
          failure_reason: string | null
          inputs_quality: Json
          intraday: Json
          key_levels: Json
          market_signals: Json
          price: number | null
          recent_events: Json
          run_id: string | null
          rvol: number | null
          rvol_class: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["watchlist_session"]
          ticker: string
          valid_through: string
          volume: number | null
        }
        Insert: {
          analyzed_at?: string
          change_pct?: number | null
          contract_version?: number
          direction: Database["public"]["Enums"]["watchlist_direction"]
          driver_ids?: Json
          explanation: string
          failure_reason?: string | null
          inputs_quality?: Json
          intraday?: Json
          key_levels?: Json
          market_signals?: Json
          price?: number | null
          recent_events?: Json
          run_id?: string | null
          rvol?: number | null
          rvol_class?: string | null
          session_date: string
          session_type: Database["public"]["Enums"]["watchlist_session"]
          ticker: string
          valid_through: string
          volume?: number | null
        }
        Update: {
          analyzed_at?: string
          change_pct?: number | null
          contract_version?: number
          direction?: Database["public"]["Enums"]["watchlist_direction"]
          driver_ids?: Json
          explanation?: string
          failure_reason?: string | null
          inputs_quality?: Json
          intraday?: Json
          key_levels?: Json
          market_signals?: Json
          price?: number | null
          recent_events?: Json
          run_id?: string | null
          rvol?: number | null
          rvol_class?: string | null
          session_date?: string
          session_type?: Database["public"]["Enums"]["watchlist_session"]
          ticker?: string
          valid_through?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_analysis_v2_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "watchlist_analysis_runs"
            referencedColumns: ["run_id"]
          },
        ]
      }
      watchlist_rvol_baseline: {
        Row: {
          baseline_date: string
          computed_at: string
          curve: Json
          sessions_used: number
          ticker: string
        }
        Insert: {
          baseline_date: string
          computed_at?: string
          curve: Json
          sessions_used: number
          ticker: string
        }
        Update: {
          baseline_date?: string
          computed_at?: string
          curve?: Json
          sessions_used?: number
          ticker?: string
        }
        Relationships: []
      }
      watchlists: {
        Row: {
          added_at: string | null
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      game_leaderboard_public: {
        Row: {
          display_name: string | null
          id: string | null
          pnl_pct: number | null
          position_count: number | null
          rank: number | null
          season_id: string | null
          updated_at: string | null
        }
        Insert: {
          display_name?: string | null
          id?: string | null
          pnl_pct?: number | null
          position_count?: number | null
          rank?: number | null
          season_id?: string | null
          updated_at?: string | null
        }
        Update: {
          display_name?: string | null
          id?: string | null
          pnl_pct?: number | null
          position_count?: number | null
          rank?: number | null
          season_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_leaderboard_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "game_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _wl_v2_has_forbidden_key: { Args: { p_val: Json }; Returns: boolean }
      apply_screener_52w_baseline_day_v1: {
        Args: {
          p_bars: Json
          p_generation_id: string
          p_provider_as_of: string
          p_session_date: string
        }
        Returns: Json
      }
      checkpoint_wl_v2_cursor: {
        Args: { p_cursor: string; p_run_id: string }
        Returns: undefined
      }
      claim_wl_v2_analysis_cycle: {
        Args: {
          p_lease_seconds: number
          p_scope: string
          p_session_type: Database["public"]["Enums"]["watchlist_session"]
        }
        Returns: {
          cursor_start: string
          run_id: string
        }[]
      }
      claim_wl_v2_worker: {
        Args: { p_lease_seconds: number; p_scope: string; p_worker: string }
        Returns: {
          cursor_start: string
          run_id: string
        }[]
      }
      complete_wl_v2_run: {
        Args: { p_cursor_end: string; p_run_id: string; p_status: string }
        Returns: undefined
      }
      fail_watchlist_analysis_v2: {
        Args: { p_error_code: string; p_request_id: string; p_user_id: string }
        Returns: Json
      }
      finalize_screener_52w_baseline_job_v1: {
        Args: {
          p_generation_id: string
          p_min_sessions: number
          p_provider_as_of: string
        }
        Returns: Json
      }
      finalize_watchlist_analysis_v2: {
        Args: {
          p_alerts: Json
          p_payload: Json
          p_request_id: string
          p_run_id: string
          p_ticker: string
          p_user_id: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      heartbeat_radar_v22_lease_v1: {
        Args: { p_holder_id: string; p_lease_key: string; p_ttl_ms: number }
        Returns: boolean
      }
      record_wl_v2_baseline_written: {
        Args: { p_run_id: string; p_ticker: string }
        Returns: undefined
      }
      record_wl_v2_run_error: {
        Args: { p_code: string; p_run_id: string; p_ticker: string }
        Returns: undefined
      }
      refresh_journal_stats: { Args: { p_user_id: string }; Returns: undefined }
      release_radar_v22_lease_v1: {
        Args: { p_holder_id: string; p_lease_key: string }
        Returns: undefined
      }
      replace_after_hours_generation_v1: {
        Args: {
          p_generation_id: string
          p_rows: Json
          p_session_date: string
          p_status: string
          p_synced_at: string
        }
        Returns: number
      }
      replace_market_session_calendar_exceptions_v1: {
        Args: { p_as_of_date: string; p_provider_as_of: string; p_rows: Json }
        Returns: number
      }
      replace_radar_v22_generation_v1: {
        Args: {
          p_archive: Json
          p_generation_id: string
          p_last_provider_event_at: string
          p_rows: Json
          p_session_date: string
          p_status: string
          p_synced_at: string
        }
        Returns: number
      }
      replace_screener_52w_baseline_generation_v1: {
        Args: {
          p_generation_id: string
          p_period_end: string
          p_period_start: string
          p_provider_as_of: string
          p_rows: Json
          p_status: string
        }
        Returns: number
      }
      replace_screener_results_generation_v1: {
        Args: {
          p_nhl_baseline_status?: string
          p_rows: Json
          p_sync_run_id: string
          p_synced_at: string
        }
        Returns: number
      }
      set_radar_v22_feed_status_v1: {
        Args: {
          p_last_provider_event_at: string
          p_status: string
          p_synced_at: string
        }
        Returns: undefined
      }
      start_screener_52w_baseline_job_v1: {
        Args: {
          p_dates_total: number
          p_generation_id: string
          p_period_end: string
          p_period_start: string
          p_provider_as_of: string
        }
        Returns: Json
      }
      try_acquire_radar_v22_lease_v1: {
        Args: { p_holder_id: string; p_lease_key: string; p_ttl_ms: number }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      watchlist_direction:
        | "bullish"
        | "bearish"
        | "neutral"
        | "data_unavailable"
      watchlist_session: "premarket" | "rth" | "postclose"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      watchlist_direction: [
        "bullish",
        "bearish",
        "neutral",
        "data_unavailable",
      ],
      watchlist_session: ["premarket", "rth", "postclose"],
    },
  },
} as const
