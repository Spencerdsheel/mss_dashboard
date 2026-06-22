CREATE SCHEMA IF NOT EXISTS local_shopmetrics;

CREATE TABLE IF NOT EXISTS local_shopmetrics.raw_visits (
    survey_id TEXT PRIMARY KEY,
    client_name TEXT,
    location_id TEXT,
    location_name TEXT,
    address TEXT,
    address2 TEXT,
    city TEXT,
    state_region TEXT,
    postal_code TEXT,
    installer TEXT,
    survey_name TEXT,
    visit_date TEXT,
    visit_time TEXT,
    time_out TEXT,
    shipped_to_location TEXT,
    clerk_name TEXT,
    install1 TEXT,
    install1_reason TEXT,
    install1_reason_comment TEXT,
    install2 TEXT,
    install2_reason TEXT,
    install2_reason_comment TEXT,
    install3 TEXT,
    price_cards TEXT,
    cold_room_measured TEXT,
    overall_comment TEXT,
    left_width TEXT,
    left_height TEXT,
    left_depth TEXT,
    right_width TEXT,
    right_height TEXT,
    right_depth TEXT,
    total TEXT
);

CREATE TABLE IF NOT EXISTS local_shopmetrics.photo_urls (
    id BIGSERIAL PRIMARY KEY,
    instance_id TEXT NOT NULL,
    attachment_question_id TEXT,
    attachment_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS raw_visits_location_idx
    ON local_shopmetrics.raw_visits(location_id);

CREATE INDEX IF NOT EXISTS photo_urls_instance_idx
    ON local_shopmetrics.photo_urls(instance_id);
