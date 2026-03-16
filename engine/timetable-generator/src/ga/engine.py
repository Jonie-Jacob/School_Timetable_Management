"""
Main GA engine — population evolution loop.

Orchestrates initialization, selection, crossover, mutation, repair,
elective alignment and convergence detection.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass

import numpy as np

from ..data_loader import SchoolData
from .chromosome import create_random_chromosome
from .fitness import evaluate
from .operators import (
    initialize_population,
    mutate_swap,
    repair_chromosome,
    tournament_selection,
    uniform_crossover,
)

# ── Configuration (from env vars with defaults) ────────────────────────────

POPULATION_SIZE = int(os.getenv("GA_POPULATION_SIZE", "100"))
MAX_GENERATIONS = int(os.getenv("GA_MAX_GENERATIONS", "500"))
MUTATION_RATE = float(os.getenv("GA_MUTATION_RATE", "0.05"))
CROSSOVER_RATE = float(os.getenv("GA_CROSSOVER_RATE", "0.8"))
TOURNAMENT_SIZE = int(os.getenv("GA_TOURNAMENT_SIZE", "5"))
CONVERGENCE_THRESHOLD = int(os.getenv("GA_CONVERGENCE_THRESHOLD", "50"))


@dataclass
class GAResult:
    """Result of a GA run for a single division."""
    best_chromosome: np.ndarray
    best_fitness: float
    generations_run: int
    elapsed_seconds: float
    converged: bool


ProgressCallback = None  # type alias placeholder
# Actual type: Callable[[int, float, float], None] — (generation, best_fitness, avg_fitness)


def run_ga(
    data: SchoolData,
    on_progress: callable | None = None,
    seed: int | None = None,
) -> GAResult:
    """
    Run the genetic algorithm for a single division.

    Args:
        data: Loaded school data for this division.
        on_progress: Optional callback(generation, best_fitness, avg_fitness).
        seed: Random seed for reproducibility.

    Returns:
        GAResult with the best chromosome and metadata.
    """
    rng = np.random.default_rng(seed)
    start_time = time.time()

    # ── Initialize population ──────────────────────────────────────────────
    population = initialize_population(data, POPULATION_SIZE, rng)

    # Repair all chromosomes to ensure valid weightage distribution
    population = [repair_chromosome(c, data, rng) for c in population]

    # ── Evaluate initial population ────────────────────────────────────────
    fitnesses = np.array([evaluate(data, c) for c in population])

    best_idx = int(np.argmax(fitnesses))
    best_fitness = float(fitnesses[best_idx])
    best_chromosome = population[best_idx].copy()

    stagnation_count = 0
    converged = False

    # ── Evolution loop ─────────────────────────────────────────────────────
    for gen in range(1, MAX_GENERATIONS + 1):
        new_population: list[np.ndarray] = []

        # Elitism: keep the best individual
        new_population.append(best_chromosome.copy())

        while len(new_population) < POPULATION_SIZE:
            # Selection
            parent1 = tournament_selection(population, fitnesses, TOURNAMENT_SIZE, rng)
            parent2 = tournament_selection(population, fitnesses, TOURNAMENT_SIZE, rng)

            # Crossover
            if rng.random() < CROSSOVER_RATE:
                child1, child2 = uniform_crossover(parent1, parent2, data, rng)
            else:
                child1, child2 = parent1.copy(), parent2.copy()

            # Mutation
            child1 = mutate_swap(child1, data, MUTATION_RATE, rng)
            child2 = mutate_swap(child2, data, MUTATION_RATE, rng)

            # Repair to fix weightage counts after crossover
            child1 = repair_chromosome(child1, data, rng)
            child2 = repair_chromosome(child2, data, rng)

            new_population.append(child1)
            if len(new_population) < POPULATION_SIZE:
                new_population.append(child2)

        population = new_population[:POPULATION_SIZE]

        # ── Evaluate ───────────────────────────────────────────────────────
        fitnesses = np.array([evaluate(data, c) for c in population])

        gen_best_idx = int(np.argmax(fitnesses))
        gen_best_fitness = float(fitnesses[gen_best_idx])
        avg_fitness = float(np.mean(fitnesses))

        # Update global best
        if gen_best_fitness > best_fitness:
            best_fitness = gen_best_fitness
            best_chromosome = population[gen_best_idx].copy()
            stagnation_count = 0
        else:
            stagnation_count += 1

        # Progress callback (every 10 generations or on improvement)
        if on_progress and (gen % 10 == 0 or stagnation_count == 0):
            on_progress(gen, best_fitness, avg_fitness)

        # Convergence check
        if stagnation_count >= CONVERGENCE_THRESHOLD:
            converged = True
            break

        # Early termination: perfect fitness (no violations)
        if best_fitness >= 0.0:
            converged = True
            break

    elapsed = time.time() - start_time

    if on_progress:
        on_progress(gen, best_fitness, avg_fitness)

    return GAResult(
        best_chromosome=best_chromosome,
        best_fitness=best_fitness,
        generations_run=gen,
        elapsed_seconds=elapsed,
        converged=converged,
    )
