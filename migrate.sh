#!/bin/bash

# ============================================================
# 🚀 DATABASE MIGRATION SCRIPT
# ============================================================
# This script sets up your entire database from scratch
# ============================================================

set -e  # Stop immediately if any command fails

# Colors for pretty output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  🏗️  STARTING DATABASE MIGRATION${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ------------------------------------------------------------
# Step 1: Check .env file exists
# ------------------------------------------------------------
echo -e "${YELLOW}📋 Step 1/5: Checking environment...${NC}"
if [ ! -f .env ]; then
    echo -e "${RED}❌ ERROR: .env file not found!${NC}"
    echo "Please create a .env file with DATABASE_URL"
    exit 1
fi

if ! grep -q "DATABASE_URL" .env; then
    echo -e "${RED}❌ ERROR: DATABASE_URL not found in .env!${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Environment OK${NC}"
echo ""

# ------------------------------------------------------------
# Step 2: Install dependencies
# ------------------------------------------------------------
echo -e "${YELLOW}📦 Step 2/5: Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# ------------------------------------------------------------
# Step 3: Validate Prisma schema
# ------------------------------------------------------------
echo -e "${YELLOW}🔍 Step 3/5: Validating Prisma schema...${NC}"
npx prisma validate
echo -e "${GREEN}✅ Schema is valid${NC}"
echo ""

# ------------------------------------------------------------
# Step 4: Generate Prisma Client
# ------------------------------------------------------------
echo -e "${YELLOW}⚙️  Step 4/5: Generating Prisma Client...${NC}"
npx prisma generate
echo -e "${GREEN}✅ Prisma Client generated${NC}"
echo ""

# ------------------------------------------------------------
# Step 5: Run the migration (creates all tables)
# ------------------------------------------------------------
echo -e "${YELLOW}🗄️  Step 5/5: Creating database tables...${NC}"
npx prisma migrate dev --name init
echo -e "${GREEN}✅ Tables created successfully${NC}"
echo ""

# ------------------------------------------------------------
# DONE!
# ------------------------------------------------------------
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  🎉 MIGRATION COMPLETE!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo -e "${BLUE}📊 Your database now has all 18 tables ready to use!${NC}"
echo ""
echo -e "${YELLOW}👉 Next step: Run 'npx prisma studio' to see your database visually${NC}"
echo ""
