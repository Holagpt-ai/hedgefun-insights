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
          headline: string
          id: string
          published_at: string | null
          source: string | null
          url: string | null
        }
        Insert: {
          category?: string | null
          headline: string
          id?: string
          published_at?: string | null
          source?: string | null
          url?: string | null
        }
        Update: {
          category?: string | null
          headline?: string
          id?: string
          published_at?: string | null
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
        }
        Insert: {
          email: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
        }
        Update: {
          email?: string
          id?: string
          source?: string | null
          subscribed_at?: string | null
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
      watchlists: {
        Row: {
          added_at: string | null
          id: string
          symbol: string
          user_id: string | null
        }
        Insert: {
          added_at?: string | null
          id?: string
          symbol: string
          user_id?: string | null
        }
        Update: {
          added_at?: string | null
          id?: string
          symbol?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
