"""
Event Engine — the architectural heart of MindMesh.

All state is derived by replaying the append-only QuizEvent log.
This module provides:
  - append_event(): atomically persist an event with monotonic sequence number
  - replay_events(): reconstruct room state by replaying events 0..N
  - compute_leaderboard(): derive ranked leaderboards from replayed state
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.db import transaction
from django.db.models import Max

from .models import Option, Participant, Question, QuizEvent, Room, Score

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# State dataclasses — returned by replay_events
# ---------------------------------------------------------------------------

@dataclass
class Answer:
    """A single answer submission."""
    participant_id: str
    question_id: str
    option_id: str
    is_correct: bool
    confidence: int  # 0–100
    latency_ms: int
    misconception_tag: str | None


@dataclass
class Cluster:
    """A group of participants sharing a misconception."""
    misconception_tag: str
    question_id: str
    participant_ids: list[str] = field(default_factory=list)

    @property
    def participant_count(self) -> int:
        return len(self.participant_ids)


@dataclass
class Lifeline:
    """A silent peer lifeline signal."""
    from_participant_id: str
    to_participant_id: str
    question_id: str


@dataclass
class RoomState:
    """
    Complete room state derived from replaying events.
    This is the canonical representation — never stored, always computed.
    """
    status: str = "lobby"
    current_question_id: str | None = None
    current_question_index: int = -1
    question_sequence: list[str] = field(default_factory=list)
    answers: dict[str, list[Answer]] = field(default_factory=dict)  # participant_id → answers
    scores: dict[str, dict[str, Any]] = field(default_factory=dict)  # participant_id → {points, calibration}
    clusters: list[Cluster] = field(default_factory=list)
    lifelines: list[Lifeline] = field(default_factory=list)
    branch_path: list[str] = field(default_factory=list)  # question_ids in the order taken
    last_sequence: int = -1
    rewound_to: int | None = None


# ---------------------------------------------------------------------------
# append_event — the ONLY way to create events
# ---------------------------------------------------------------------------

def append_event(
    room: Room,
    event_type: str,
    payload: dict | None = None,
) -> QuizEvent:
    """
    Atomically append an event with the next monotonic sequence number.
    Uses SELECT ... FOR UPDATE to prevent race conditions.
    """
    if payload is None:
        payload = {}

    with transaction.atomic():
        # Lock all events for this room to prevent concurrent sequence allocation
        current_max = (
            QuizEvent.objects.select_for_update()
            .filter(room=room)
            .aggregate(max_seq=Max("sequence_number"))["max_seq"]
        )
        next_seq = 0 if current_max is None else current_max + 1

        event = QuizEvent.objects.create(
            room=room,
            event_type=event_type,
            payload=payload,
            sequence_number=next_seq,
        )
        logger.info(
            "Event [%d] %s in room %s: %s",
            next_seq, event_type, room.code, payload,
        )
        return event


# ---------------------------------------------------------------------------
# replay_events — reconstruct state from the event log
# ---------------------------------------------------------------------------

def replay_events(
    room: Room,
    up_to_sequence: int | None = None,
) -> RoomState:
    """
    Replay events 0..N and return the derived RoomState.
    If up_to_sequence is None, replays ALL events (current state).
    This is what enables rewind and ghost replay.
    """
    queryset = QuizEvent.objects.filter(room=room).order_by("sequence_number")
    if up_to_sequence is not None:
        queryset = queryset.filter(sequence_number__lte=up_to_sequence)

    state = RoomState()

    # Pre-fetch option metadata for correctness checking
    option_cache: dict[str, dict] = {}

    for event in queryset:
        _apply_event(state, event, option_cache)

    state.last_sequence = (
        queryset.last().sequence_number if queryset.exists() else -1
    )

    # Compute scores from answers
    _compute_scores_from_answers(state)

    return state


def _apply_event(
    state: RoomState,
    event: QuizEvent,
    option_cache: dict[str, dict],
) -> None:
    """Apply a single event to the state accumulator."""
    payload = event.payload or {}

    if event.event_type == "question_shown":
        question_id = payload.get("question_id")
        state.current_question_id = question_id
        state.current_question_index += 1
        state.question_sequence.append(question_id)
        state.branch_path.append(question_id)
        state.status = "live"

    elif event.event_type == "answer_submitted":
        participant_id = payload.get("participant_id")
        option_id = payload.get("option_id")
        confidence = payload.get("confidence", 50)
        latency_ms = payload.get("latency_ms", 0)
        question_id = payload.get("question_id", state.current_question_id)

        # Look up option correctness
        opt_info = _get_option_info(option_id, option_cache)

        answer = Answer(
            participant_id=participant_id,
            question_id=question_id,
            option_id=option_id,
            is_correct=opt_info.get("is_correct", False),
            confidence=confidence,
            latency_ms=latency_ms,
            misconception_tag=opt_info.get("misconception_tag"),
        )

        if participant_id not in state.answers:
            state.answers[participant_id] = []
        state.answers[participant_id].append(answer)

        # Update live clusters for this question
        _update_clusters(state, answer)

    elif event.event_type == "lifeline_sent":
        lifeline = Lifeline(
            from_participant_id=payload.get("from_participant_id"),
            to_participant_id=payload.get("to_participant_id"),
            question_id=payload.get("question_id", state.current_question_id),
        )
        state.lifelines.append(lifeline)

    elif event.event_type == "host_paused":
        state.status = "paused"

    elif event.event_type == "host_resumed":
        state.status = "live"

    elif event.event_type == "host_rewound":
        target = payload.get("to_sequence_number", 0)
        state.rewound_to = target

    elif event.event_type == "question_branch_selected":
        question_id = payload.get("question_id")
        if question_id:
            state.branch_path.append(question_id)

    elif event.event_type == "session_ended":
        state.status = "ended"


def _get_option_info(option_id: str, cache: dict[str, dict]) -> dict:
    """Fetch and cache option metadata."""
    if option_id in cache:
        return cache[option_id]

    try:
        option = Option.objects.get(id=option_id)
        info = {
            "is_correct": option.is_correct,
            "misconception_tag": option.misconception_tag,
        }
    except Option.DoesNotExist:
        info = {"is_correct": False, "misconception_tag": None}

    cache[option_id] = info
    return info


def _update_clusters(state: RoomState, answer: Answer) -> None:
    """
    Update misconception clusters with a new answer.
    Only wrong answers with a misconception_tag contribute to clusters.
    """
    if answer.is_correct or not answer.misconception_tag:
        return

    # Find existing cluster for this tag + question
    for cluster in state.clusters:
        if (
            cluster.misconception_tag == answer.misconception_tag
            and cluster.question_id == answer.question_id
        ):
            if answer.participant_id not in cluster.participant_ids:
                cluster.participant_ids.append(answer.participant_id)
            return

    # Create new cluster
    state.clusters.append(
        Cluster(
            misconception_tag=answer.misconception_tag,
            question_id=answer.question_id,
            participant_ids=[answer.participant_id],
        )
    )


# ---------------------------------------------------------------------------
# Score computation
# ---------------------------------------------------------------------------

def _compute_scores_from_answers(state: RoomState) -> None:
    """Compute both standard and calibration scores from answer history."""
    from .scoring import compute_standard_score, compute_calibration_score

    for participant_id, answers in state.answers.items():
        total_points = 0
        total_calibration = 0.0

        for ans in answers:
            total_points += compute_standard_score(
                is_correct=ans.is_correct,
                latency_ms=ans.latency_ms,
                time_limit_ms=30000,  # Default; in production read from question
            )
            total_calibration += compute_calibration_score(
                is_correct=ans.is_correct,
                confidence=ans.confidence,
            )

        state.scores[participant_id] = {
            "points": total_points,
            "calibration": round(total_calibration, 2),
            "answers_count": len(answers),
        }


# ---------------------------------------------------------------------------
# Leaderboard computation
# ---------------------------------------------------------------------------

def compute_leaderboard(
    room: Room,
    state: RoomState | None = None,
) -> dict:
    """
    Compute dual leaderboards from replayed state.
    Returns {standard: [...], calibration: [...]}.
    Each entry includes:
      - question_track: [{q_index, is_correct}] for per-question answer dots
      - streak: current consecutive correct streak
    """
    if state is None:
        state = replay_events(room)

    # Fetch participant display names
    participants = {
        str(p.id): p.display_name
        for p in Participant.objects.filter(room=room, is_ghost=False)
    }

    # Build question index map (question_id → order index)
    q_index_map = {qid: i for i, qid in enumerate(state.question_sequence)}

    standard = []
    calibration = []

    for pid, score_data in state.scores.items():
        name = participants.get(pid, "Unknown")
        p_answers = state.answers.get(pid, [])

        # Build per-question track sorted by question order
        track = []
        for ans in p_answers:
            q_idx = q_index_map.get(ans.question_id, -1)
            track.append({"q_index": q_idx, "is_correct": ans.is_correct})
        track.sort(key=lambda x: x["q_index"])

        # Compute current streak (consecutive correct from most recent)
        streak = 0
        for ans in reversed(p_answers):
            # Sort by q_index descending
            if ans.is_correct:
                streak += 1
            else:
                break

        standard.append({
            "participant_id": pid,
            "display_name": name,
            "points": score_data["points"],
            "question_track": track,
            "streak": streak,
        })
        calibration.append({
            "participant_id": pid,
            "display_name": name,
            "calibration_score": score_data["calibration"],
            "question_track": track,
            "streak": streak,
        })

    # Sort: highest first
    standard.sort(key=lambda x: x["points"], reverse=True)
    calibration.sort(key=lambda x: x["calibration_score"], reverse=True)

    # Add rank
    for i, entry in enumerate(standard):
        entry["rank"] = i + 1
    for i, entry in enumerate(calibration):
        entry["rank"] = i + 1

    return {"standard": standard, "calibration": calibration}


def persist_scores(room: Room, state: RoomState | None = None) -> None:
    """Persist computed scores to the Score table (cache for history views)."""
    if state is None:
        state = replay_events(room)

    for participant_id, score_data in state.scores.items():
        try:
            participant = Participant.objects.get(id=participant_id)
        except Participant.DoesNotExist:
            continue

        Score.objects.update_or_create(
            participant=participant,
            room=room,
            defaults={
                "points": score_data["points"],
                "calibration_score": score_data["calibration"],
                "user": participant.user,  # Link score to authenticated user
            },
        )
