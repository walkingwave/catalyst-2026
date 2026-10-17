export type Concert = {
  id: string;
  name: string;
  artist: string;
  venue: string;
  date: string;
};

export type Activity = {
  id: string;
  concert_id: string;
  name: string;
  points: number;
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
