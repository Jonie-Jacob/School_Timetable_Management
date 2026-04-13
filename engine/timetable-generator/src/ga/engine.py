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
    mutate_adjacency,
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

# When adjacency constraint is on, the search space is harder — bump params.
ADJ_POPULATION_SIZE = int(os.getenv("GA_ADJ_POPULATION_SIZE", "200"))
ADJ_MAX_GENERATIONS = int(os.getenv("GA_ADJ_MAX_GENERATIONS", "1500"))
ADJ_MUTATION_RATE = float(os.getenv("GA_ADJ_MUTATION_RATE", "0.25"))
ADJ_CONVERGENCE_THRESHOLD = int(os.getenv("GA_ADJ_CONVERGENCE_THRESHOLD", "150"))


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

    # Pick GA parameters based on adjacency constraint
    pop_size = ADJ_POPULATION_SIZE if data.adjacency_constraint_enabled else POPULATION_SIZE
    max_gens = ADJ_MAX_GENERATIONS if data.adjacency_constraint_enabled else MAX_GENERATIONS
    mut_rate = ADJ_MUTATION_RATE if data.adjacency_constraint_enabled else MUTATION_RATE
    conv_threshold = ADJ_CONVERGENCE_THRESHOLD if data.adjacency_constraint_enabled else CONVERGENCE_THRESHOLD

    # ── Initialize population ──────────────────────────────────────────────
    population = initialize_population(data, pop_size, rng)

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
    for gen in range(1, max_gens + 1):
        new_population: list[np.ndarray] = []

        # Elitism: keep the best individual
        new_population.append(best_chromosome.copy())

        while len(new_population) < pop_size:
            # Selection
            parent1 = tournament_selection(population, fitnesses, TOURNAMENT_SIZE, rng)
            parent2 = tournament_selection(population, fitnesses, TOURNAMENT_SIZE, rng)

            # Crossover
            if rng.random() < CROSSOVER_RATE:
                child1, child2 = uniform_crossover(parent1, parent2, data, rng)
            else:
                child1, child2 = parent1.copy(), parent2.copy()

            # Mutation — standard swap
            child1 = mutate_swap(child1, data, mut_rate, rng)
            child2 = mutate_swap(child2, data, mut_rate, rng)

            # Adjacency-specific mutation — cluster same-subject periods
            if data.adjacency_constraint_enabled:
                child1 = mutate_adjacency(child1, data, mut_rate, rng)
                child2 = mutate_adjacency(child2, data, mut_rate, rng)

            # Repair to fix weightage counts after crossover
            child1 = repair_chromosome(child1, data, rng)
            child2 = repair_chromosome(child2, data, rng)

            new_population.append(child1)
            if len(new_population) < pop_size:
                new_population.append(child2)

        population = new_population[:pop_size]

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
        if stagnation_count >= conv_threshold:
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
