export interface Event {
  id: number;
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  node_id?: number;
  node_name?: string;
  building_name?: string;
  floor_level?: number;
  organizer?: string;
  category?: string;
  is_active: boolean;
}

export interface EventCreate {
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  node_id?: number;
  organizer?: string;
  category?: string;
}

export interface EventUpdate {
  name?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location_name?: string;
  node_id?: number;
  organizer?: string;
  category?: string;
  is_active?: boolean;
}
