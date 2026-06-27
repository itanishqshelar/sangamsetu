-- SangamSetu Phase 2 starter
-- Run this after phase1_setup.sql.
-- It creates import tables for the attached geography CSVs and a simple
-- rule-based matching view so imported data can immediately power the frontend.

create table if not exists zone_boundaries (
  zone_name text primary key,
  centroid_lat double precision,
  centroid_lng double precision,
  approx_boundary_points integer
);

create table if not exists cctv_locations (
  camera_id text primary key,
  longitude double precision,
  latitude double precision
);

create table if not exists police_stations (
  station_name text primary key,
  longitude double precision,
  latitude double precision
);

create table if not exists chokepoints_parking (
  location_name text primary key,
  category text,
  longitude double precision,
  latitude double precision
);

create or replace view report_geo_summary as
select
  count(*) as total_reports,
  count(*) filter (where report_type = 'missing') as missing_reports,
  count(*) filter (where report_type = 'found') as found_reports,
  count(*) filter (where status = 'Pending') as pending_reports,
  count(*) filter (where status = 'Reunited') as reunited_reports
from reports;

create or replace view reference_data_summary as
select 'zones' as dataset_name, count(*)::bigint as row_count from zone_boundaries
union all
select 'cctv_locations' as dataset_name, count(*)::bigint as row_count from cctv_locations
union all
select 'police_stations' as dataset_name, count(*)::bigint as row_count from police_stations
union all
select 'chokepoints_parking' as dataset_name, count(*)::bigint as row_count from chokepoints_parking;

create or replace view possible_report_matches as
select
  m.report_id as missing_report_id,
  f.report_id as found_report_id,
  m.name as missing_name,
  f.name as found_name,
  m.gender,
  m.age_band,
  m.last_seen_location as missing_last_seen_location,
  f.last_seen_location as found_last_seen_location,
  m.reporting_center as missing_reporting_center,
  f.reporting_center as found_reporting_center,
  m.reported_at as missing_reported_at,
  f.reported_at as found_reported_at,
  abs(extract(epoch from (m.reported_at - f.reported_at))) / 3600.0 as time_gap_hours,
  case
    when m.last_seen_location = f.last_seen_location then 'same last-seen location'
    when m.reporting_center = f.reporting_center then 'same reporting center'
    else 'same age band and gender'
  end as match_reason
from reports m
join reports f
  on m.report_type = 'missing'
 and f.report_type = 'found'
 and m.gender = f.gender
 and m.age_band = f.age_band
 and m.report_id <> f.report_id
 and m.status <> 'Reunited'
 and f.status <> 'Reunited'
 and abs(extract(epoch from (m.reported_at - f.reported_at))) <= 6 * 3600
order by time_gap_hours asc, m.reported_at desc;
