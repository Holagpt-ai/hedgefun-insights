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
        }
        Insert: {
          id?: string
          tag_id: string
          trade_id: string
        }
        Update: {
          id?: string
          tag_id?: string
          trade_id?: string
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
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    },
  },
} as const
