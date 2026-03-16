# Timetable Generation Engine

Genetic Algorithm-based timetable generation engine for the School Timetable Management System.

## Local Development

```bash
cd engine/timetable-generator
python -m venv venv
venv\Scripts\activate   # Windows
pip install -r requirements.txt
python -m src.main --job-id <JOB_ID> --school-id <SCHOOL_ID> --division-id <DIV_ID> --academic-year-id <AY_ID>
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://timetable_admin:localdev123@localhost:5433/timetable_dev` | PostgreSQL connection string |
| `WS_ENDPOINT` | `http://localhost:4011` | WebSocket service URL for progress updates |
| `GA_POPULATION_SIZE` | `100` | Number of chromosomes per generation |
| `GA_MAX_GENERATIONS` | `500` | Maximum generations before stopping |
| `GA_MUTATION_RATE` | `0.05` | Probability of gene mutation |
| `GA_CROSSOVER_RATE` | `0.8` | Probability of crossover |
| `GA_TOURNAMENT_SIZE` | `5` | Tournament selection size |
| `GA_CONVERGENCE_THRESHOLD` | `50` | Stop if no improvement for N generations |

## Docker (Fargate)

```bash
docker build -t timetable-generator .
docker run --env-file ../../.env timetable-generator --job-id ... --school-id ... --division-id ... --academic-year-id ...
```
