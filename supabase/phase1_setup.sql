-- SangamSetu Phase 1 MVP setup
-- This script is self-contained for hackathon setup and will create the lookup
-- tables if they do not already exist.

create extension if not exists pgcrypto;

create table if not exists last_seen_location_lookup (
  location_name text primary key,
  lat double precision,
  lng double precision
);

create table if not exists reporting_center_lookup (
  center_name text primary key,
  lat double precision,
  lng double precision
);

-- Seeded from the attached dataset.
-- Lat/lng are left null for Phase 1 because the MVP only needs the names for
-- dropdowns and cross-center visibility. Replace these with real coordinates
-- before Phase 2 map work.
insert into last_seen_location_lookup (location_name, lat, lng) values
  ('Adgaon Parking', null, null),
  ('Bus Stand Nashik', null, null),
  ('Dasak Ghat', null, null),
  ('Dindori Road Crossing', null, null),
  ('Gauri Patangan', null, null),
  ('Kapila Sangam', null, null),
  ('Kushavart Kund', null, null),
  ('Laxmi Narayan Ghat', null, null),
  ('Madsangvi Transit', null, null),
  ('Main Police Chowki', null, null),
  ('Nandur Ghat', null, null),
  ('Nashik Road Station', null, null),
  ('Panchavati Circle', null, null),
  ('Rajur Bahula', null, null),
  ('Ramkund Ghat', null, null),
  ('Sadhugram Gate 1', null, null),
  ('Sadhugram Gate 2', null, null),
  ('Takli Sangam', null, null),
  ('Trimbak Road', null, null),
  ('Trimbakeshwar Approach', null, null)
on conflict (location_name) do nothing;

insert into reporting_center_lookup (center_name, lat, lng) values
  ('Adgaon Kho-Ya-Paya', null, null),
  ('Bharat Bharati Control Room', null, null),
  ('Central Control Room', null, null),
  ('Nashik Road Center', null, null),
  ('Panchavati Center', null, null),
  ('Police Main Control Room', null, null),
  ('Rajur Bahula Center', null, null),
  ('Ramkund Kho-Ya-Paya Kendra', null, null),
  ('Sadhugram Lost Found', null, null),
  ('Trimbakeshwar Kho-Ya-Paya Kendra', null, null)
on conflict (center_name) do nothing;

create table if not exists reports (
  report_id uuid default gen_random_uuid() primary key,
  report_type text not null check (report_type in ('missing', 'found')),
  reported_at timestamptz not null default now(),
  name text,
  gender text check (gender in ('Male', 'Female', 'Unknown')),
  age_band text check (age_band in ('0-12', '13-17', '18-40', '41-60', '61-70', '71-80', '80+')),
  language text,
  last_seen_location text references last_seen_location_lookup(location_name),
  reporting_center text references reporting_center_lookup(center_name),
  reporter_mobile text,
  physical_description text,
  remarks text,
  status text not null default 'Pending'
    check (status in ('Pending', 'Reunited', 'Transferred to hospital', 'Unresolved')),
  created_at timestamptz default now()
);

alter table reports replica identity full;

-- Enable Realtime for the reports table in Supabase after running this script.
-- In the dashboard: Database -> Replication -> turn on reports.

-- TEMPORARY HACKATHON SCAFFOLDING ONLY:
-- This keeps Phase 1 easy to demo with anon access and no auth.
-- Replace with proper auth + restrictive RLS before any real deployment.
alter table reports disable row level security;
