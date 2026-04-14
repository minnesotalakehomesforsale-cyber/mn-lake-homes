-- =========================================================================
-- MN LAKE HOMES: PHASE 1 DATABASE SCHEMA
-- PostgreSQL Architecture
-- Fix 2: All CREATE TYPE and CREATE TABLE statements now use IF NOT EXISTS
--        so this script is safely re-runnable in staging and production.
-- =========================================================================

-- Enable UUID extension globally
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 0. ENUM DEFINITIONS
-- ==========================================
DO $$ BEGIN
    CREATE TYPE role_type AS ENUM ('super_admin', 'admin', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE account_status_type AS ENUM ('active', 'pending', 'suspended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE profile_status_type AS ENUM ('draft', 'pending_review', 'published', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE lead_status_type AS ENUM ('new', 'unassigned', 'assigned', 'contacted', 'in_progress', 'closed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE lead_request_type AS ENUM ('buyer', 'seller', 'general_contact', 'agent_inquiry', 'join_request', 'market_report', 'property_question');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ==========================================
-- 1. USERS
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(150) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    full_name VARCHAR(300),
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    password_hash VARCHAR(255) NOT NULL,
    
    role role_type NOT NULL,
    account_status account_status_type NOT NULL DEFAULT 'pending',
    
    last_login_at TIMESTAMP WITH TIME ZONE,
    email_verified_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);

-- ==========================================
-- 2. MEMBERSHIPS (Agent Tiers)
-- ==========================================
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(150) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    display_badge_label VARCHAR(100),
    sort_priority INTEGER NOT NULL DEFAULT 100,
    is_active BOOLEAN DEFAULT true NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Idempotent membership seeds
INSERT INTO memberships (name, code, description, display_badge_label, sort_priority) VALUES 
('Basic', 'basic', 'Standard network agent profile', null, 300),
('MN Lake Specialist', 'mn_lake_specialist', 'Verified specialist for major lake zones', 'Lake Specialist', 200),
('Top Agent', 'top_agent', 'Highest volume luxury partners', 'Top Agent', 100)
ON CONFLICT (code) DO NOTHING;

-- ==========================================
-- 3. AGENTS (Public Profiles)
-- ==========================================
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE RESTRICT,
    
    slug VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    brokerage_name VARCHAR(255),
    license_number VARCHAR(100),
    
    phone_public VARCHAR(50),
    email_public VARCHAR(255),
    website_url VARCHAR(500),
    
    city VARCHAR(100),
    state VARCHAR(50) DEFAULT 'Minnesota',
    service_areas JSONB,
    specialties JSONB,
    
    bio TEXT,
    years_experience INTEGER,
    profile_photo_url VARCHAR(500),
    cover_photo_url VARCHAR(500),
    
    facebook_url VARCHAR(500),
    instagram_url VARCHAR(500),
    linkedin_url VARCHAR(500),
    youtube_url VARCHAR(500),
    
    is_featured BOOLEAN DEFAULT false NOT NULL,
    is_verified BOOLEAN DEFAULT false NOT NULL,
    
    profile_status profile_status_type NOT NULL DEFAULT 'draft',
    is_published BOOLEAN DEFAULT false NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    
    approved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);
CREATE INDEX IF NOT EXISTS idx_agents_membership_id ON agents(membership_id);
CREATE INDEX IF NOT EXISTS idx_agents_profile_status ON agents(profile_status);
CREATE INDEX IF NOT EXISTS idx_agents_is_published ON agents(is_published);
CREATE INDEX IF NOT EXISTS idx_agents_is_featured ON agents(is_featured);

-- ==========================================
-- 4. LEADS (Centralized Inbox)
-- ==========================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    first_name VARCHAR(150),
    last_name VARCHAR(150),
    full_name VARCHAR(300),
    email VARCHAR(255),
    phone VARCHAR(50),
    message TEXT,
    
    lead_type lead_request_type NOT NULL,
    lead_source VARCHAR(100) NOT NULL,
    source_page_url VARCHAR(1000),
    source_page_title VARCHAR(255),
    
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    lead_status lead_status_type NOT NULL DEFAULT 'new',
    contact_preference VARCHAR(50),
    location_text VARCHAR(255),
    budget_min DECIMAL(15,2),
    budget_max DECIMAL(15,2),
    timeline_text VARCHAR(150),
    
    form_payload_json JSONB,
    
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_agent_id ON leads(agent_id);
CREATE INDEX IF NOT EXISTS idx_leads_submitted_at ON leads(submitted_at);

-- ==========================================
-- 5. LEAD ASSIGNMENTS (Historical Audits)
-- ==========================================
CREATE TABLE IF NOT EXISTS lead_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    assigned_to_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    assignment_note TEXT,
    is_current BOOLEAN DEFAULT true NOT NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_assign_lead ON lead_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_assign_to ON lead_assignments(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_assign_by ON lead_assignments(assigned_by_user_id);
CREATE INDEX IF NOT EXISTS idx_lead_assign_current ON lead_assignments(is_current);

-- ==========================================
-- 6. LEAD NOTES (Internal Messenger)
-- ==========================================
CREATE TABLE IF NOT EXISTS lead_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    note_body TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT true NOT NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_user ON lead_notes(user_id);

-- ==========================================
-- 7. ACTIVITY LOG (System Ledger)
-- ==========================================
CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    
    action VARCHAR(100) NOT NULL,
    action_label VARCHAR(255),
    
    old_value_json JSONB,
    new_value_json JSONB,
    meta_json JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);

-- ==========================================
-- 8. SYSTEM SETTINGS
-- ==========================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    setting_key VARCHAR(150) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    description TEXT,
    updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- ==========================================
-- 9. MEDIA ASSETS (File Pointers)
-- ==========================================
CREATE TABLE IF NOT EXISTS media_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    
    file_url VARCHAR(1000) NOT NULL,
    file_type VARCHAR(100),
    file_name VARCHAR(300),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);
