/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Academy {
  name: string;
  api: string;
}

export interface Course {
  id: number;
  course_name: string;
  course_thumbnail: string;
  item_id?: number;
  title?: string;
}

export interface Video {
  id: number;
  Title: string;
  date_and_time?: string;
  recording_schedule?: string;
  strtotime?: number;
  material_type?: string;
  download_link?: string;
  download_links?: { path: string }[];
  encrypted_links?: { path: string; key: string }[];
  video_player_url?: string;
  video_player_token?: string;
}

export interface AuthData {
  token: string;
  userId: string;
  apiBase: string;
}
