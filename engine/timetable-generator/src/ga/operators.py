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


def _build_adjacency_blocks(data: SchoolData) -> list[list[int]]:
    """Return the break-aware adjacency blocks for each day.

    Each block is a list of consecutive period indices (0-based within the
    day) that have no break between them.  For example, with breaks after
    P2 and between P6-P7, and lunch after P4:
        [[0,1], [2,3], [4,5], [6,7]]
    """
    ppd = data.periods_per_day
    if ppd == 0:
        return []

    # Build blocks for day 0 — all days share the same period structure
    blocks: list[list[int]] = [[0]]
    for p in range(1, ppd):
        if (0, p) in data.period_after_break:
            blocks.append([p])
        else:
            blocks[-1].append(p)
    return blocks


def mutate_adjacency(
    chromosome: np.ndarray,
    data: SchoolData,
    mutation_rate: float,
    rng: np.random.Generator,
) -> np.ndarray:
    """Adjacency-aware mutation: for EACH multi-period assignment on a day,
    try to cluster its occurrences into the same adjacency block by swapping
    stray instances with neighbors of existing instances.

    Break-aware: only considers periods in the same break-free block as truly
    adjacent (e.g. P2 and P3 are NOT adjacent if a break sits between them).
    """
    ppd = data.periods_per_day
    blocks = _build_adjacency_blocks(data)
    if not blocks:
        return chromosome

    # Build period → block_index lookup
    period_to_block: dict[int, int] = {}
    for bi, block in enumerate(blocks):
        for p in block:
            period_to_block[p] = bi

    for day_idx in range(data.num_days):
        if rng.random() >= mutation_rate:
            continue
        start = day_idx * ppd
        day_slice = chromosome[start:start + ppd]

        # Find assignments that appear 2+ times this day
        counts: dict[int, list[int]] = {}
        for p in range(ppd):
            a = int(day_slice[p])
            if a >= 0:
                counts.setdefault(a, []).append(p)

        multi = [(a, ps) for a, ps in counts.items() if len(ps) >= 2]
        if not multi:
            continue

        # Process ALL multi-period assignments (not just one random one)
        rng.shuffle(multi)
        for _, positions in multi:
            # Check which block each occurrence is in
            block_counts: dict[int, list[int]] = {}
            for p in positions:
                bi = period_to_block[p]
                block_counts.setdefault(bi, []).append(p)

            # If all in the same block and contiguous, already adjacent
            if len(block_counts) == 1:
                ps = sorted(list(block_counts.values())[0])
                if all(ps[i+1] - ps[i] == 1 for i in range(len(ps)-1)):
                    continue

            # Find the block with the most occurrences — try to consolidate there
            best_block = max(block_counts, key=lambda bi: len(block_counts[bi]))
            best_positions = set(block_counts[best_block])

            # For each occurrence NOT in the best block, try to swap it into
            # an adjacent slot in the best block
            for bi, ps in block_counts.items():
                if bi == best_block:
                    continue
                for source_p in ps:
                    # Find free slots in the best block (next to existing occurrences)
                    block_slots = blocks[best_block]
                    for target_p in block_slots:
                        if target_p in best_positions:
                            continue
                        # Check if target_p is adjacent to any existing occurrence
                        if any(abs(target_p - ep) == 1 for ep in best_positions):
                            si, ti = start + source_p, start + target_p
                            chromosome[si], chromosome[ti] = chromosome[ti], chromosome[si]
                            best_positions.add(target_p)
                            best_positions.discard(source_p)
                            break

    return chromosome


def initialize_population(
    data: SchoolData,
    pop_size: int,
    rng: np.random.Generator,
) -> list[np.ndarray]:
    """Create the initial population.

    When adjacency_constraint_enabled is True, half the population uses
    adjacency-aware seeding (assignments clustered into blocks per day)
    and half is purely random for diversity.
    """
    if not data.adjacency_constraint_enabled:
        return [create_random_chromosome(data, rng) for _ in range(pop_size)]

    population: list[np.ndarray] = []
    clustered_count = pop_size // 2
    for _ in range(clustered_count):
        population.append(_create_clustered_chromosome(data, rng))
    for _ in range(pop_size - clustered_count):
        population.append(create_random_chromosome(data, rng))
    return population


def _create_clustered_chromosome(data: SchoolData, rng: np.random.Generator) -> np.ndarray:
    """Create a chromosome where multi-period assignments are pre-clustered
    into break-aligned adjacency blocks.

    Strategy:
    1. Compute adjacency blocks from the period structure (e.g. [P1,P2], [P3,P4], [P5,P6], [P7,P8]).
    2. For each assignment, place its weightage in PAIRS aligned to these blocks.
       An 8-period subject fills 4 blocks of 2 across different days.
    3. Shuffle block order within each day for variety while preserving adjacency.
    """
    ppd = data.periods_per_day
    num_days = data.num_days
    total = data.total_periods
    logicals = data.logical_assignments
    adj_blocks = _build_adjacency_blocks(data)

    # Available block slots: (day_idx, block_idx, block_size)
    # Each "slot" is one adjacency block on one day.
    # Track which block-slots are free.
    # day_block_free[day][block_idx] = remaining capacity in that block
    day_block_free: list[list[int]] = []
    for _ in range(num_days):
        day_block_free.append([len(b) for b in adj_blocks])

    # Result: day_block_assignments[day][block_idx] = list of assignment indices
    day_block_assignments: list[list[list[int]]] = []
    for _ in range(num_days):
        day_block_assignments.append([[] for _ in adj_blocks])

    # Sort assignments by weightage descending — heavier subjects get first pick
    order = sorted(range(len(logicals)), key=lambda i: logicals[i].weightage, reverse=True)

    for a_idx in order:
        la = logicals[a_idx]
        remaining = la.weightage
        if remaining <= 0:
            continue

        # Place in pairs (or fill block capacity) across shuffled days
        day_order = list(range(num_days))
        rng.shuffle(day_order)

        # Multiple passes: first try to place pairs, then singles for leftovers
        for target_size in [2, 1]:
            for d in day_order:
                if remaining <= 0:
                    break
                # Shuffle block order within this day
                block_order = list(range(len(adj_blocks)))
                rng.shuffle(block_order)
                for bi in block_order:
                    if remaining <= 0:
                        break
                    free = day_block_free[d][bi]
                    place = min(remaining, free, target_size)
                    if place < target_size and target_size > 1:
                        continue  # skip this block, look for one with room for a pair
                    if place <= 0:
                        continue
                    day_block_assignments[d][bi].extend([a_idx] * place)
                    day_block_free[d][bi] -= place
                    remaining -= place

    # Assemble chromosome
    chromosome = np.full(total, -1, dtype=np.int32)
    for d in range(num_days):
        gene_idx = d * ppd
        for bi, block in enumerate(adj_blocks):
            assigned = day_block_assignments[d][bi]
            # Pad with -1 if block not fully filled
            free = len(block) - len(assigned)
            filled = assigned + ([-1] * free)
            rng.shuffle(filled)  # shuffle within block for variety
            for val in filled:
                chromosome[gene_idx] = val
                gene_idx += 1

    return chromosome
