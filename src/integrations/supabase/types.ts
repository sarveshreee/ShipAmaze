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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      couriers: {
        Row: {
          active: boolean
          air_rate: number | null
          avg_delivery_days: number | null
          cod_support: boolean | null
          created_at: string
          delivery_rate: number | null
          id: string
          name: string
          ndr_rate: number | null
          priority: number
          reverse_pickup: boolean | null
          rto_rate: number | null
          surface_rate: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          air_rate?: number | null
          avg_delivery_days?: number | null
          cod_support?: boolean | null
          created_at?: string
          delivery_rate?: number | null
          id?: string
          name: string
          ndr_rate?: number | null
          priority?: number
          reverse_pickup?: boolean | null
          rto_rate?: number | null
          surface_rate?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          air_rate?: number | null
          avg_delivery_days?: number | null
          cod_support?: boolean | null
          created_at?: string
          delivery_rate?: number | null
          id?: string
          name?: string
          ndr_rate?: number | null
          priority?: number
          reverse_pickup?: boolean | null
          rto_rate?: number | null
          surface_rate?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          cod_charges: number | null
          created_at: string
          date: string | null
          gst: number | null
          id: string
          invoice_id: string
          orders_count: number | null
          period: string | null
          shipping_charges: number | null
          status: string
          total: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cod_charges?: number | null
          created_at?: string
          date?: string | null
          gst?: number | null
          id?: string
          invoice_id: string
          orders_count?: number | null
          period?: string | null
          shipping_charges?: number | null
          status?: string
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cod_charges?: number | null
          created_at?: string
          date?: string | null
          gst?: number | null
          id?: string
          invoice_id?: string
          orders_count?: number | null
          period?: string | null
          shipping_charges?: number | null
          status?: string
          total?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      manifests: {
        Row: {
          courier: string | null
          created_at: string
          date: string | null
          id: string
          manifest_id: string
          orders_count: number | null
          pickup_address: string | null
          pickup_time: string | null
          status: string
          total_weight: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          courier?: string | null
          created_at?: string
          date?: string | null
          id?: string
          manifest_id: string
          orders_count?: number | null
          pickup_address?: string | null
          pickup_time?: string | null
          status?: string
          total_weight?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          courier?: string | null
          created_at?: string
          date?: string | null
          id?: string
          manifest_id?: string
          orders_count?: number | null
          pickup_address?: string | null
          pickup_time?: string | null
          status?: string
          total_weight?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ndr_orders: {
        Row: {
          attempts: number | null
          awb: string
          created_at: string
          customer: string | null
          id: string
          last_update: string | null
          next_action: string | null
          phone: string | null
          reason: string | null
          seller: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number | null
          awb: string
          created_at?: string
          customer?: string | null
          id?: string
          last_update?: string | null
          next_action?: string | null
          phone?: string | null
          reason?: string | null
          seller?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number | null
          awb?: string
          created_at?: string
          customer?: string | null
          id?: string
          last_update?: string | null
          next_action?: string | null
          phone?: string | null
          reason?: string | null
          seller?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          address: string | null
          amount: number
          awb: string | null
          city: string | null
          courier: string | null
          created_at: string
          customer: string
          date: string | null
          dimensions: string | null
          id: string
          order_id: string
          payment: string
          phone: string | null
          pickup_address: string | null
          pincode: string | null
          products: Json | null
          status: string
          updated_at: string
          user_id: string | null
          weight: string | null
          zone: string | null
        }
        Insert: {
          address?: string | null
          amount?: number
          awb?: string | null
          city?: string | null
          courier?: string | null
          created_at?: string
          customer: string
          date?: string | null
          dimensions?: string | null
          id?: string
          order_id: string
          payment?: string
          phone?: string | null
          pickup_address?: string | null
          pincode?: string | null
          products?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weight?: string | null
          zone?: string | null
        }
        Update: {
          address?: string | null
          amount?: number
          awb?: string | null
          city?: string | null
          courier?: string | null
          created_at?: string
          customer?: string
          date?: string | null
          dimensions?: string | null
          id?: string
          order_id?: string
          payment?: string
          phone?: string | null
          pickup_address?: string | null
          pincode?: string | null
          products?: Json | null
          status?: string
          updated_at?: string
          user_id?: string | null
          weight?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      pickup_addresses: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          contact_name: string | null
          created_at: string
          id: string
          is_default: boolean | null
          label: string
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          label: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          is_default?: boolean | null
          label?: string
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          dimensions: string | null
          hsn: string | null
          id: string
          name: string
          price: number | null
          selling_price: number | null
          sku: string | null
          stock: number | null
          updated_at: string
          user_id: string | null
          weight: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          dimensions?: string | null
          hsn?: string | null
          id?: string
          name: string
          price?: number | null
          selling_price?: number | null
          sku?: string | null
          stock?: number | null
          updated_at?: string
          user_id?: string | null
          weight?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          dimensions?: string | null
          hsn?: string | null
          id?: string
          name?: string
          price?: number | null
          selling_price?: number | null
          sku?: string | null
          stock?: number | null
          updated_at?: string
          user_id?: string | null
          weight?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          business_name: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          business_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      return_orders: {
        Row: {
          awb: string | null
          courier: string | null
          created_at: string
          customer: string | null
          date: string | null
          id: string
          original_order_id: string | null
          reason: string | null
          refund_amount: number | null
          return_id: string
          status: string
          updated_at: string
          user_id: string | null
          weight: string | null
        }
        Insert: {
          awb?: string | null
          courier?: string | null
          created_at?: string
          customer?: string | null
          date?: string | null
          id?: string
          original_order_id?: string | null
          reason?: string | null
          refund_amount?: number | null
          return_id: string
          status?: string
          updated_at?: string
          user_id?: string | null
          weight?: string | null
        }
        Update: {
          awb?: string | null
          courier?: string | null
          created_at?: string
          customer?: string | null
          date?: string | null
          id?: string
          original_order_id?: string | null
          reason?: string | null
          refund_amount?: number | null
          return_id?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          weight?: string | null
        }
        Relationships: []
      }
      tab_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tab_key: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tab_key: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tab_key?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          balance: number
          created_at: string
          date: string | null
          description: string | null
          id: string
          txn_id: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          balance?: number
          created_at?: string
          date?: string | null
          description?: string | null
          id?: string
          txn_id: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          balance?: number
          created_at?: string
          date?: string | null
          description?: string | null
          id?: string
          txn_id?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weight_disputes: {
        Row: {
          awb: string | null
          charged_amount: number | null
          courier: string | null
          courier_weight: string | null
          created_at: string
          date: string | null
          diff: string | null
          dispute_id: string
          expected_amount: number | null
          id: string
          order_id: string | null
          seller_weight: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          awb?: string | null
          charged_amount?: number | null
          courier?: string | null
          courier_weight?: string | null
          created_at?: string
          date?: string | null
          diff?: string | null
          dispute_id: string
          expected_amount?: number | null
          id?: string
          order_id?: string | null
          seller_weight?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          awb?: string | null
          charged_amount?: number | null
          courier?: string | null
          courier_weight?: string | null
          created_at?: string
          date?: string | null
          diff?: string | null
          dispute_id?: string
          expected_amount?: number | null
          id?: string
          order_id?: string | null
          seller_weight?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
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
      app_role: "admin" | "vendor" | "dropshipper"
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
      app_role: ["admin", "vendor", "dropshipper"],
    },
  },
} as const
