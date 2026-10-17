export type Artist = {
  id: string;
  slug: string;
  name: string;
  kind: "artist" | "team";
  image_url?: string | null;
  bio?: string;
};

export type Concert = {
  id: string;
  name: string;
  artist: string;
  artist_id?: string | null;
  venue: string;
  date: string;
  image_url?: string | null;
  venue_image_url?: string | null;
  description?: string;
  doors_at?: string | null;
  address?: string | null;
  live_activity_id?: string | null;
};

export type Activity = {
  id: string;
  concert_id: string;
  name: string;
  points: number;
  map_x?: number | null;
  map_y?: number | null;
  location?: string | null;
  icon?: string | null;
  kind?: "scan" | "social";
  social_network?: string | null;
};

export type SocialPost = {
  id: string;
  user_id: string;
  activity_id: string;
  url: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
};

export type Drop = {
  id: string;
  artist_id: string;
  user_id: string;
  title: string;
  message: string;
  code: string | null;
  claimed_at: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  artist_id: string;
  user_id: string;
  channel: "inbox" | "sms";
  body: string;
  sms_status: string | null;
  created_at: string;
};

export type Band = {
  uid: string;
  concert_id: string;
  user_id: string | null;
  claimed_at: string | null;
  archived: boolean;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: "merch" | "discount_code";
  stock: number;
  artist_id?: string | null;
};

export type ScanResult = {
  ok: boolean;
  status: "scanned" | "duplicate" | "error";
  message: string;
  points?: number;
  activity?: string;
  band_uid?: string;
  claimed?: boolean;
  owner_name?: string;
  rank?: number | null;
  total_tonight?: number;
};
