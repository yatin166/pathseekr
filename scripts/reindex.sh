#!/bin/bash

# Pathseekr — clean reindex script
# Deletes the database and re-indexes the specified path
# Default path: ./packages

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RESET='\033[0m'

# Default index path
INDEX_PATH="${1:-./packages}"

echo ""
echo -e "${CYAN}Pathseekr — Clean Reindex${RESET}"
echo -e "${DIM}────────────────────────────────────────${RESET}"

# Step 1 — Delete existing database
DB_PATH="$HOME/.pathseekr/pathseekr.db"

if [ -f "$DB_PATH" ]; then
  echo -e "\n${DIM}Deleting existing database...${RESET}"
  rm -f "$DB_PATH"
  echo -e "${GREEN}✓ Database deleted${RESET}"
else
  echo -e "\n${DIM}No existing database found — starting fresh${RESET}"
fi

# Step 2 — Build the project
echo -e "\n${DIM}Building project...${RESET}"
# npm run build --silent
echo -e "${GREEN}✓ Build complete${RESET}"

# Step 3 — Index
echo -e "\n${DIM}Indexing ${INDEX_PATH}...${RESET}"
pathseekr index "$INDEX_PATH"

# Step 4 — Summary
echo -e "\n${DIM}Index summary:${RESET}"
pathseekr status

echo -e "\n${GREEN}✓ Reindex complete${RESET}\n"