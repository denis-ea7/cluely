-- Migration: Add premium_until column to users table
-- Date: 2024-11-10
-- Description: Adds premium_until column to track premium subscription expiration date

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP WITH TIME ZONE;

-- Add index for faster queries on premium status
CREATE INDEX IF NOT EXISTS idx_users_premium_until ON users(premium_until);

-- Add comment
COMMENT ON COLUMN users.premium_until IS 'Premium subscription expiration date. NULL means free tier.';

