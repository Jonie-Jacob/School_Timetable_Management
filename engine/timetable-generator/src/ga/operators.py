"""
GA operators: selection, crossover, and mutation.
"""

from __future__ import annotations

import numpy as np

from ..data_loader import SchoolData
from .chromosome import create_random_chromosome


def tournament_selection(
    population: list[np.ndarray],
    fitnesses: np.ndarray,
    tournament_size: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Select one individual via tournament selection (higher fitness = better)."""
    indices = rng.choice(len(population), size=tournament_size, replace=False)
    best_idx = indices[np.argmax(fitnesses[indices])]
    return population[best_idx].copy()


def uniform_crossover(
    parent1: np.ndarray,
    parent2: np.ndarray,
    data: SchoolData,
    rng: np.random.Generator,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Uniform crossover respecting day boundaries.

    For each day, choose whether to take genes from parent1 or parent2.
    This preserves within-day structure while mixing between days.
    """
    child1 = parent1.copy()
    child2 = parent2.copy()
    ppd = data.periods_per_day

    for day_idx in range(data.num_days):
        start = day_idx * ppd
        end = start + ppd
        if rng.random() < 0.5:
            child1[start:end] = parent2[start:end]
            child2[start:end] = parent1[start:end]

    return child1, child2


def mutate_swap(
    chromosome: np.ndarray,
    data: SchoolData,
    mutation_rate: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Mutation: swap two random slots within the same day.

    For each day, with probability mutation_rate, pick two random period
    positions and swap their assignments. This preserves the overall
    assignment distribution.
    """
    ppd = data.periods_per_day

    for day_idx in range(data.num_days):
        if rng.random() < mutation_rate:
            start = day_idx * ppd
            # Pick two random positions within this day
            pos1, pos2 = rng.choice(ppd, size=2, replace=False)
            i, j = start + pos1, start + pos2
            chromosome[i], chromosome[j] = chromosome[j], chromosome[i]

    return chromosome


def repair_chromosome(
    chromosome: np.ndarray,
    data: SchoolData,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Repair a chromosome to ensure each LOGICAL assignment appears exactly
    `weightage` times.

    After crossover, counts may be wrong. This repair step:
    1. Counts actual occurrences of each logical assignment.
    2. Identifies over-represented and under-represented ones.
    3. Randomly converts excess occurrences to needed ones.
    """
    logicals = data.logical_assignments
    total = len(chromosome)

    # Count current occurrences
    counts: dict[int, int] = {}
    for idx in range(len(logicals)):
        counts[idx] = int(np.count_nonzero(chromosome == idx))

    # Build deficit/surplus lists
    surplus_genes: list[int] = []  # gene indices to reassign
    deficit: list[tuple[int, int]] = []  # (logical_idx, needed_count)

    for idx, la in enumerate(logicals):
        diff = counts.get(idx, 0) - la.weightage
        if diff > 0:
            # Find gene indices with this logical and mark excess for replacement
            gene_indices = [gi for gi in range(total) if int(chromosome[gi]) == idx]
            rng.shuffle(gene_indices)
            surplus_genes.extend(gene_indices[:diff])
        elif diff < 0:
            deficit.append((idx, -diff))

    # Also collect free period (-1) genes if we need more assignments
    free_genes = [gi for gi in range(total) if int(chromosome[gi]) == -1]
    rng.shuffle(free_genes)

    # Fill deficits from surplus first, then from free genes
    available = surplus_genes + free_genes
    rng.shuffle(available)

    ai = 0
    for assign_idx, needed in deficit:
        for _ in range(needed):
            if ai < len(available):
                chromosome[available[ai]] = assign_idx
                ai += 1

    # Any remaining surplus genes become free periods
    for i in range(ai, len(surplus_genes)):
        if i < len(available):
            chromosome[available[i]] = -1

    return chromosome


def initialize_population(
    data: SchoolData,
    pop_size: int,
    rng: np.random.Generator,
) -> list[np.ndarray]:
    """Create the initial population of random chromosomes."""
    return [create_random_chromosome(data, rng) for _ in range(pop_size)]
