-- db/schema.sql

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    avatar_url TEXT,
    provider TEXT NOT NULL,
    created_at INTEGER DEFAULT (unixepoch()),
    last_login INTEGER
);

-- 2. Tabla de Planes
CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price_monthly INTEGER DEFAULT 0,
    max_file_size_kb INTEGER NOT NULL,
    daily_conversion_limit INTEGER NOT NULL,
    allow_browser_engine BOOLEAN DEFAULT 0,
    allow_google_sheets BOOLEAN DEFAULT 0,
    allow_all_dialects BOOLEAN DEFAULT 0
);

-- 3. Suscripciones
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT PRIMARY KEY,
    plan_id INTEGER NOT NULL,
    status TEXT DEFAULT 'active',
    current_period_end INTEGER,
    stripe_customer_id TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (plan_id) REFERENCES plans(id)
);

-- 4. Historial de Uso
CREATE TABLE IF NOT EXISTS daily_usage (
    user_id TEXT NOT NULL,
    date_ref TEXT NOT NULL,
    conversion_count INTEGER DEFAULT 0,
    total_bytes_processed INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date_ref),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- DATOS INICIALES (Para que tengas algo con qué probar)
INSERT INTO plans (name, max_file_size_kb, daily_conversion_limit, allow_browser_engine, allow_google_sheets) 
VALUES 
('free', 500, 3, 0, 0),
('pro', -1, -1, 1, 1);