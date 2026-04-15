#!/bin/bash
# Run the timetable engine locally against the local PostgreSQL database.
#
# Usage:
#   bash scripts/run-engine-local.sh                  # all divisions
#   bash scripts/run-engine-local.sh --adjacency      # with adjacency constraint
#   bash scripts/run-engine-local.sh --division "Class I A"  # single division by label

set -e

DB_URL="postgresql://timetable_admin:localdev123@localhost:5433/timetable_dev"
EXTRA_ARGS=""

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --adjacency) EXTRA_ARGS="--adjacency-constraint"; shift ;;
    --division) SINGLE_DIV="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "=== Local Engine Runner ==="
echo ""

# 1. Find active school + academic year (prefer school with most divisions)
read -r SCHOOL_ID AY_ID <<< $(PGPASSWORD="localdev123" psql -h localhost -p 5433 -U timetable_admin -d timetable_dev -t -A -F' ' -c "
  SELECT s.id, ay.id
  FROM schools s
  JOIN academic_years ay ON ay.school_id = s.id
  LEFT JOIN divisions d ON d.school_id = s.id AND d.academic_year_id = ay.id AND d.deleted_at IS NULL
  WHERE ay.status = 'ACTIVE'
  GROUP BY s.id, ay.id
  ORDER BY COUNT(d.id) DESC
  LIMIT 1;
")

if [ -z "$SCHOOL_ID" ] || [ -z "$AY_ID" ]; then
  echo "ERROR: No active school/academic year found in local DB"
  exit 1
fi

echo "School:  $SCHOOL_ID"
echo "AY:      $AY_ID"

# 2. Get division IDs
if [ -n "$SINGLE_DIV" ]; then
  DIVISIONS=$(PGPASSWORD="localdev123" psql -h localhost -p 5433 -U timetable_admin -d timetable_dev -t -A -c "
    SELECT d.id
    FROM divisions d
    JOIN classes c ON c.id = d.class_id
    WHERE d.deleted_at IS NULL
      AND d.academic_year_id = '$AY_ID'
      AND d.school_id = '$SCHOOL_ID'
      AND (c.name || ' ' || d.label) = '$SINGLE_DIV'
    LIMIT 1;
  ")
  if [ -z "$DIVISIONS" ]; then
    echo "ERROR: Division '$SINGLE_DIV' not found"
    exit 1
  fi
else
  DIVISIONS=$(PGPASSWORD="localdev123" psql -h localhost -p 5433 -U timetable_admin -d timetable_dev -t -A -c "
    SELECT d.id
    FROM divisions d
    JOIN classes c ON c.id = d.class_id
    WHERE d.deleted_at IS NULL
      AND d.academic_year_id = '$AY_ID'
      AND d.school_id = '$SCHOOL_ID'
    ORDER BY c.sort_order, d.label;
  ")
fi

# Convert to comma-separated
DIV_IDS=$(echo "$DIVISIONS" | tr '\n' ',' | sed 's/,$//')
DIV_COUNT=$(echo "$DIVISIONS" | wc -l | tr -d ' ')

echo "Divisions: $DIV_COUNT"
echo ""

# 3. Create generation jobs for each division
JOB_IDS=""
for DIV_ID in $DIVISIONS; do
  DIV_ID=$(echo "$DIV_ID" | tr -d '[:space:]')
  [ -z "$DIV_ID" ] && continue
  JOB_ID=$(PGPASSWORD="localdev123" psql -h localhost -p 5433 -U timetable_admin -d timetable_dev -t -A -c "
    INSERT INTO generation_jobs (id, school_id, division_id, academic_year_id, status, started_at, created_at, updated_at)
    VALUES (gen_random_uuid(), '$SCHOOL_ID', '$DIV_ID', '$AY_ID', 'PENDING', NOW(), NOW(), NOW())
    RETURNING id;
  ")
  if [ -z "$JOB_IDS" ]; then
    JOB_IDS="$JOB_ID"
  else
    JOB_IDS="$JOB_IDS,$JOB_ID"
  fi
done

echo "Created $DIV_COUNT generation jobs"
echo ""

# 4. Run the engine
echo "=== Starting Engine ==="
echo ""

cd "$(dirname "$0")/../engine/timetable-generator"

# Activate venv if it exists
if [ -f .venv/Scripts/activate ]; then
  source .venv/Scripts/activate
elif [ -f .venv/bin/activate ]; then
  source .venv/bin/activate
fi

if [ "$DIV_COUNT" -eq 1 ]; then
  # Single division mode
  DATABASE_URL="$DB_URL" python -m src.main \
    --job-id "$(echo $JOB_IDS | tr -d ' ')" \
    --school-id "$SCHOOL_ID" \
    --division-id "$(echo $DIV_IDS | tr -d ' ')" \
    --academic-year-id "$AY_ID" \
    $EXTRA_ARGS
else
  # Batch mode
  DATABASE_URL="$DB_URL" python -m src.main \
    --job-ids "$JOB_IDS" \
    --school-id "$SCHOOL_ID" \
    --division-ids "$DIV_IDS" \
    --academic-year-id "$AY_ID" \
    $EXTRA_ARGS
fi

echo ""
echo "=== Done ==="
echo "View results: npm run dev:all → open http://localhost:5173/timetables"
