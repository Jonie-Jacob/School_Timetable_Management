"""
Chromosome encoding for the timetable GA.

A chromosome represents a complete timetable for a single division.
Each gene corresponds to one (working_day, period_slot) pair and holds
the index of the assigned LogicalAssignment (or -1 for a free period).

Layout:
    chromosome[day_index * periods_per_day + period_index] = logical_index

`logical_index` maps into SchoolData.logical_assignments.

A LogicalAssignment may wrap a single ordinary DivisionAssignment OR an
entire elective group (multiple parallel teachers all sharing the slot).
The output writer expands one elective placement into N TimetableSlot rows.
"""

from __future__ import annotations

import numpy as np

from ..data_loader import SchoolData


def create_random_chromosome(data: SchoolData, rng: np.random.Generator) -> np.ndarray:
    """
    Create a random chromosome that respects weightage constraints.

    Each LOGICAL assignment's weightage tells us how many periods per week it
    should occupy (for an elective group this is `ElectiveGroup.periods_per_week`,
    NOT the sum of member weightages). We fill the chromosome by distributing
    logical assignments according to their weightage, then shuffle within the
    week to add randomness.
    """
    total = data.total_periods
    chromosome = np.full(total, -1, dtype=np.int32)

    # Build a pool of logical-assignment indices repeated by weightage
    pool: list[int] = []
    for idx, la in enumerate(data.logical_assignments):
        pool.extend([idx] * la.weightage)

    # If pool is smaller than total periods, pad with -1 (free/unassigned)
    # If larger (shouldn't happen with correct data), truncate
    if len(pool) < total:
        pool.extend([-1] * (total - len(pool)))
    elif len(pool) > total:
        pool = pool[:total]

    rng.shuffle(pool)
    chromosome[:] = pool

    return chromosome


def decode_gene(data: SchoolData, gene_index: int) -> tuple[int, int, str, str]:
    """
    Convert a gene index to (day_index, period_index, working_day_id, slot_id).
    """
    ppd = data.periods_per_day
    day_index = gene_index // ppd
    period_index = gene_index % ppd

    wd_id = data.working_day_ids[day_index]
    slot_id = data.slots_by_day[wd_id][period_index].id

    return day_index, period_index, wd_id, slot_id


def get_day_slice(data: SchoolData, chromosome: np.ndarray, day_index: int) -> np.ndarray:
    """Get the slice of the chromosome for a specific day."""
    ppd = data.periods_per_day
    start = day_index * ppd
    return chromosome[start : start + ppd]


def count_assignment_periods(chromosome: np.ndarray, assignment_index: int) -> int:
    """Count how many times an assignment appears in the chromosome."""
    return int(np.count_nonzero(chromosome == assignment_index))


def create_seeded_chromosome(seed: np.ndarray, data: SchoolData, rng: np.random.Generator) -> np.ndarray:
    """Create a chromosome from a pre-placed seed array.

    The seed already has assignments placed by the greedy placer. We add
    small random perturbations (swap 2-3 within-day pairs) so the GA
    population has diversity while preserving the greedy structure.
    """
    chromosome = seed.copy()
    ppd = data.periods_per_day

    # Randomly swap 1-3 pairs within each day for diversity
    swaps = rng.integers(1, 4)
    for _ in range(swaps):
        day_idx = rng.integers(0, data.num_days)
        start = day_idx * ppd
        pos1, pos2 = rng.choice(ppd, size=2, replace=False)
        i, j = start + pos1, start + pos2
        chromosome[i], chromosome[j] = chromosome[j], chromosome[i]

    return chromosome
