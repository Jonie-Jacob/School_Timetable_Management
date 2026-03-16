"""
Elective group handler.

Ensures that elective group subjects are scheduled in the same slots across
all divisions that share the group. This is accomplished by:

1. Pre-selecting time slots for each elective group.
2. Locking those gene positions so crossover/mutation don't break alignment.
3. Providing a repair function that re-aligns elective slots after operators run.
"""

from __future__ import annotations

import numpy as np

from ..data_loader import SchoolData


def get_elective_gene_indices(data: SchoolData, chromosome: np.ndarray) -> set[int]:
    """Return gene indices that correspond to elective assignments."""
    elective_indices: set[int] = set()
    for gi in range(data.total_periods):
        a_idx = int(chromosome[gi])
        if a_idx < 0:
            continue
        if data.assignments[a_idx].elective_group_id:
            elective_indices.add(gi)
    return elective_indices


def align_elective_slots(
    data: SchoolData,
    chromosomes: dict[str, np.ndarray],
    rng: np.random.Generator,
) -> dict[str, np.ndarray]:
    """
    Align elective group assignments across multiple division chromosomes.

    For each elective group, pick the gene positions from the first division
    that has them, and force all other divisions in that group to put their
    elective assignment in the same positions.

    This is called after population initialization and after each generation's
    crossover/mutation to maintain alignment.
    """
    if not data.elective_groups:
        return chromosomes

    for eg_id, eg_info in data.elective_groups.items():
        # Find which divisions in our batch share this elective group
        batch_divs = [
            div_id for div_id in data.batch_division_ids
            if div_id in eg_info.division_assignments and div_id in chromosomes
        ]
        if len(batch_divs) < 2:
            continue

        # Use the first division's elective positions as the reference
        ref_div = batch_divs[0]
        ref_chromo = chromosomes[ref_div]
        ref_assignments = data.all_division_assignments.get(ref_div, [])

        # Find gene positions where the reference has this elective
        ref_positions: list[int] = []
        for gi in range(len(ref_chromo)):
            a_idx = int(ref_chromo[gi])
            if a_idx < 0 or a_idx >= len(ref_assignments):
                continue
            if ref_assignments[a_idx].elective_group_id == eg_id:
                ref_positions.append(gi)

        if not ref_positions:
            continue

        # Force other divisions to have their elective at the same positions
        for div_id in batch_divs[1:]:
            chromo = chromosomes[div_id]
            div_assignments = data.all_division_assignments.get(div_id, [])
            if not div_assignments:
                continue

            # Find this division's elective assignment index
            elective_a_idx = None
            for idx, a in enumerate(div_assignments):
                if a.elective_group_id == eg_id:
                    elective_a_idx = idx
                    break
            if elective_a_idx is None:
                continue

            # Clear existing elective placements
            current_positions = [
                gi for gi in range(len(chromo))
                if int(chromo[gi]) == elective_a_idx
            ]
            displaced_values = []
            for gi in current_positions:
                if gi not in ref_positions:
                    chromo[gi] = -1
                    displaced_values.append(elective_a_idx)

            # Place elective at reference positions
            for gi in ref_positions:
                if gi < len(chromo):
                    old_val = int(chromo[gi])
                    if old_val != elective_a_idx:
                        chromo[gi] = elective_a_idx
                        if old_val >= 0:
                            displaced_values.append(old_val)

            # Put displaced assignments into free slots
            free_slots = [
                gi for gi in range(len(chromo))
                if int(chromo[gi]) == -1 and gi not in ref_positions
            ]
            rng.shuffle(free_slots)
            for i, val in enumerate(displaced_values):
                if i < len(free_slots):
                    chromo[free_slots[i]] = val

            chromosomes[div_id] = chromo

    return chromosomes
