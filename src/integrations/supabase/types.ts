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
      alerts: {
        Row: {
          created_at: string
          id: string
          message: string | null
          passenger_id: string
          read: boolean
          trip_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          passenger_id: string
          read?: boolean
          trip_id: string
          type: Database["public"]["Enums"]["alert_type"]
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          passenger_id?: string
          read?: boolean
          trip_id?: string
          type?: Database["public"]["Enums"]["alert_type"]
        }
        Relationships: [
          {
            foreignKeyName: "alerts_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          created_at: string
          dropoff_stage_id: string | null
          fare_paid: number | null
          id: string
          passenger_id: string
          pickup_stage_id: string | null
          seat_number: number | null
          status: Database["public"]["Enums"]["booking_status"]
          trip_id: string
        }
        Insert: {
          created_at?: string
          dropoff_stage_id?: string | null
          fare_paid?: number | null
          id?: string
          passenger_id: string
          pickup_stage_id?: string | null
          seat_number?: number | null
          status?: Database["public"]["Enums"]["booking_status"]
          trip_id: string
        }
        Update: {
          created_at?: string
          dropoff_stage_id?: string | null
          fare_paid?: number | null
          id?: string
          passenger_id?: string
          pickup_stage_id?: string | null
          seat_number?: number | null
          status?: Database["public"]["Enums"]["booking_status"]
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_dropoff_stage_id_fkey"
            columns: ["dropoff_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_pickup_stage_id_fkey"
            columns: ["pickup_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_transactions: {
        Row: {
          created_at: string
          held_amount: number
          id: string
          payment_id: string
          released_at: string | null
          sacco_id: string | null
        }
        Insert: {
          created_at?: string
          held_amount: number
          id?: string
          payment_id: string
          released_at?: string | null
          sacco_id?: string | null
        }
        Update: {
          created_at?: string
          held_amount?: number
          id?: string
          payment_id?: string
          released_at?: string | null
          sacco_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escrow_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_transactions_sacco_id_fkey"
            columns: ["sacco_id"]
            isOneToOne: false
            referencedRelation: "saccos"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          id: string
          mpesa_receipt: string | null
          payer_id: string
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          id?: string
          mpesa_receipt?: string | null
          payer_id: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          id?: string
          mpesa_receipt?: string | null
          payer_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      routes: {
        Row: {
          base_fare: number | null
          created_at: string
          created_by: string | null
          destination: string
          id: string
          name: string
          origin: string
          sacco_id: string | null
        }
        Insert: {
          base_fare?: number | null
          created_at?: string
          created_by?: string | null
          destination: string
          id?: string
          name: string
          origin: string
          sacco_id?: string | null
        }
        Update: {
          base_fare?: number | null
          created_at?: string
          created_by?: string | null
          destination?: string
          id?: string
          name?: string
          origin?: string
          sacco_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "routes_sacco_id_fkey"
            columns: ["sacco_id"]
            isOneToOne: false
            referencedRelation: "saccos"
            referencedColumns: ["id"]
          },
        ]
      }
      saccos: {
        Row: {
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          owner_id: string
          registration_number: string | null
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          registration_number?: string | null
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          registration_number?: string | null
        }
        Relationships: []
      }
      stages: {
        Row: {
          added_by: string | null
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          order_index: number
          route_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          order_index?: number
          route_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          order_index?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          current_stage_id: string | null
          driver_id: string
          ended_at: string | null
          fare: number
          id: string
          route_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["trip_status"]
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          current_stage_id?: string | null
          driver_id: string
          ended_at?: string | null
          fare: number
          id?: string
          route_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          vehicle_id: string
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          current_stage_id?: string | null
          driver_id?: string
          ended_at?: string | null
          fare?: number
          id?: string
          route_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["trip_status"]
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
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
      vehicles: {
        Row: {
          capacity: number
          created_at: string
          driver_id: string | null
          id: string
          nickname: string | null
          plate_number: string
          sacco_id: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          capacity: number
          created_at?: string
          driver_id?: string | null
          id?: string
          nickname?: string | null
          plate_number: string
          sacco_id?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          capacity?: number
          created_at?: string
          driver_id?: string | null
          id?: string
          nickname?: string | null
          plate_number?: string
          sacco_id?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_sacco_id_fkey"
            columns: ["sacco_id"]
            isOneToOne: false
            referencedRelation: "saccos"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      get_my_sacco_contact_phone: {
        Args: { _sacco_id: string }
        Returns: string
      }
      get_my_sacco_dashboard: {
        Args: never
        Returns: {
          driver_count: number
          live_trip_count: number
          revenue_today: number
          route_count: number
          sacco_id: string
          today_trip_count: number
          vehicle_count: number
        }[]
      }
      get_my_sacco_drivers: {
        Args: { _sacco_id: string }
        Returns: {
          driver_id: string
          full_name: string
          phone: string
          plate_number: string
          status: string
          vehicle_id: string
        }[]
      }
      get_primary_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_trip_location: {
        Args: { _trip_id: string }
        Returns: {
          current_lat: number
          current_lng: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      alert_type: "near_pickup" | "near_dropoff" | "alight_request"
      app_role: "passenger" | "driver" | "conductor" | "sacco_admin"
      booking_status:
        | "reserved"
        | "confirmed"
        | "boarded"
        | "alighted"
        | "cancelled"
      payment_status: "pending" | "held" | "released" | "refunded" | "failed"
      trip_status:
        | "scheduled"
        | "boarding"
        | "in_transit"
        | "completed"
        | "cancelled"
      vehicle_type: "matatu_14" | "matatu_25" | "bus_33" | "bus_51"
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
      alert_type: ["near_pickup", "near_dropoff", "alight_request"],
      app_role: ["passenger", "driver", "conductor", "sacco_admin"],
      booking_status: [
        "reserved",
        "confirmed",
        "boarded",
        "alighted",
        "cancelled",
      ],
      payment_status: ["pending", "held", "released", "refunded", "failed"],
      trip_status: [
        "scheduled",
        "boarding",
        "in_transit",
        "completed",
        "cancelled",
      ],
      vehicle_type: ["matatu_14", "matatu_25", "bus_33", "bus_51"],
    },
  },
} as const
