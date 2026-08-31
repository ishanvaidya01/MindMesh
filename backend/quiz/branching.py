"""
Adaptive Branching Engine (Phase 4)

Evaluates branch conditions on questions to determine which
question to show next based on live misconception cluster data.

Branch condition format:
{
    "if_misconception_tag": "sign_error",
    "threshold_pct": 40
}

Means: "If >40% of participants share the 'sign_error' misconception
on the parent question, branch to this question."
"""

from __future__ import annotations

import logging
from typing import Any

from .models import Question, Room
from .event_engine import RoomState

logger = logging.getLogger(__name__)


def evaluate_branch(
    room: Room,
    current_question: Question,
    state: RoomState,
    total_participants: int,
) -> tuple[Question | None, str]:
    """
    Evaluate branching conditions for the current question.

    Returns (next_question, reason):
        - If a branch condition is met → (branch_question, reason_text)
        - If no branches or no condition met → (None, "")
          Caller should fall back to linear ordering.
    """
    # Find child branches of the current question
    branches = Question.objects.filter(
        branch_parent=current_question
    ).order_by("order")

    if not branches.exists():
        return None, ""

    if total_participants == 0:
        return None, ""

    for branch_question in branches:
        condition = branch_question.branch_condition
        if not condition:
            continue

        if _evaluate_condition(condition, state, current_question, total_participants):
            reason = (
                f"Branch taken: >{condition.get('threshold_pct', 0)}% share "
                f"misconception '{condition.get('if_misconception_tag', '?')}'"
            )
            logger.info("Room %s: %s → Q%s", room.code, reason, branch_question.order)
            return branch_question, reason

    return None, ""


def _evaluate_condition(
    condition: dict[str, Any],
    state: RoomState,
    parent_question: Question,
    total_participants: int,
) -> bool:
    """
    Evaluate a single branch condition against current cluster state.
    """
    tag = condition.get("if_misconception_tag")
    threshold_pct = condition.get("threshold_pct", 0)

    if not tag:
        return False

    # Find the cluster for this tag on the parent question
    parent_q_id = str(parent_question.id)
    for cluster in state.clusters:
        if (
            cluster.misconception_tag == tag
            and cluster.question_id == parent_q_id
        ):
            pct = (cluster.participant_count / total_participants) * 100
            return pct > threshold_pct

    return False


def get_next_question(
    room: Room,
    current_question: Question,
    state: RoomState,
    total_participants: int,
) -> tuple[Question | None, str]:
    """
    Determine the next question, considering branching first,
    then falling back to linear order.

    Returns (next_question, reason).
    reason is empty string for linear progression.
    """
    # Try branch evaluation first
    branch_q, reason = evaluate_branch(
        room, current_question, state, total_participants
    )
    if branch_q:
        return branch_q, reason

    # Fall back to linear ordering: next question in the quiz
    next_questions = Question.objects.filter(
        quiz=room.quiz,
        order__gt=current_question.order,
        branch_parent__isnull=True,  # Skip branch-only questions in linear flow
    ).order_by("order")

    next_q = next_questions.first()
    return next_q, ""


def get_branch_tree(quiz_id: str) -> dict:
    """
    Build the full branch tree structure for a quiz.
    Used for the host-facing git-graph visualization.

    Returns a tree structure:
    {
        "nodes": [
            {"id": "q_id", "label": "Q1: ...", "order": 1, "is_branch": False},
            ...
        ],
        "edges": [
            {"from": "parent_q_id", "to": "child_q_id", "condition": {...}, "type": "branch"},
            {"from": "q_id", "to": "next_q_id", "type": "linear"},
        ],
        "path_taken": ["q_id_1", "q_id_2", ...]  # populated from state.branch_path
    }
    """
    questions = Question.objects.filter(quiz_id=quiz_id).order_by("order")

    nodes = []
    edges = []

    question_list = list(questions)
    for i, q in enumerate(question_list):
        nodes.append({
            "id": str(q.id),
            "label": f"Q{q.order}: {q.text[:50]}",
            "order": q.order,
            "is_branch": q.branch_parent is not None,
            "branch_condition": q.branch_condition,
        })

        # Branch edge
        if q.branch_parent:
            edges.append({
                "from": str(q.branch_parent.id),
                "to": str(q.id),
                "condition": q.branch_condition,
                "type": "branch",
            })

        # Linear edge to next non-branch question
        if not q.branch_parent and i + 1 < len(question_list):
            for next_q in question_list[i + 1:]:
                if not next_q.branch_parent:
                    edges.append({
                        "from": str(q.id),
                        "to": str(next_q.id),
                        "type": "linear",
                    })
                    break

    return {"nodes": nodes, "edges": edges}
