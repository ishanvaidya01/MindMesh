"""
MindMesh Data Models

Event-sourced architecture: QuizEvent is the single source of truth.
All live state, leaderboard, clusters, and history are derived by
replaying the event log.
"""

import random
import string
import uuid

from django.db import models


from django.contrib.auth.models import User

class Quiz(models.Model):
    """A quiz template containing ordered questions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    owner = models.CharField(max_length=100, help_text="Host display name (legacy)")
    creator = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_quizzes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "quizzes"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title


class Question(models.Model):
    """
    A single question within a quiz.
    Supports adaptive branching via branch_parent and branch_condition.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="questions")
    text = models.TextField()
    explanation = models.TextField(
        blank=True,
        default="",
        help_text="AI-generated explanation for the correct answer",
    )
    time_limit_seconds = models.IntegerField(default=30)
    order = models.IntegerField(default=0)
    branch_parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="branches",
        help_text="Parent question that branches to this one",
    )
    branch_condition = models.JSONField(
        null=True,
        blank=True,
        help_text=(
            'Condition to select this branch, e.g. '
            '{"if_misconception_tag": "sign_error", "threshold_pct": 40}'
        ),
    )

    class Meta:
        ordering = ["order"]

    def __str__(self):
        return f"Q{self.order}: {self.text[:60]}"


class Option(models.Model):
    """
    An answer option for a question.
    Wrong options carry a misconception_tag — the seed of
    MindMesh's differentiation layer.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    question = models.ForeignKey(
        Question, on_delete=models.CASCADE, related_name="options"
    )
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    misconception_tag = models.CharField(
        max_length=200,
        null=True,
        blank=True,
        help_text="Human-readable misconception label for wrong answers",
    )

    def __str__(self):
        marker = "\u2713" if self.is_correct else "\u2717"
        return f"{marker} {self.text[:60]}"


class Room(models.Model):
    """
    A live quiz session. Participants connect to a room via a 6-char code.
    """

    STATUS_CHOICES = [
        ("lobby", "Lobby"),
        ("live", "Live"),
        ("paused", "Paused"),
        ("ended", "Ended"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name="rooms")
    code = models.CharField(max_length=6, unique=True, db_index=True)
    host = models.CharField(max_length=100, help_text="Host display name")
    host_token = models.UUIDField(default=uuid.uuid4, help_text="Host auth token")
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="lobby")
    current_question = models.ForeignKey(
        Question, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Room {self.code} ({self.status})"

    @staticmethod
    def generate_code():
        """Generate a unique 6-character alphanumeric room code."""
        for _ in range(100):
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if not Room.objects.filter(code=code).exists():
                return code
        raise RuntimeError("Failed to generate unique room code after 100 attempts")


class Participant(models.Model):
    """A person in a room, either live or a ghost replayer."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="participants")
    room = models.ForeignKey(
        Room, on_delete=models.CASCADE, related_name="participants"
    )
    display_name = models.CharField(max_length=100)
    session_token = models.UUIDField(default=uuid.uuid4, unique=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    is_ghost = models.BooleanField(default=False)
    signal_tokens = models.IntegerField(
        default=3, help_text="Remaining silent lifeline tokens"
    )

    def __str__(self):
        label = "ghost" if self.is_ghost else "live"
        return f"{self.display_name} ({label})"


class QuizEvent(models.Model):
    """
    Append-only event log — the single source of truth.

    All live state is derived by replaying events 0..N.
    Never mutate or delete rows from this table.
    """

    EVENT_TYPES = [
        ("question_shown", "Question Shown"),
        ("answer_submitted", "Answer Submitted"),
        ("confidence_set", "Confidence Set"),
        ("lifeline_sent", "Lifeline Sent"),
        ("host_paused", "Host Paused"),
        ("host_resumed", "Host Resumed"),
        ("host_rewound", "Host Rewound"),
        ("question_branch_selected", "Question Branch Selected"),
        ("session_ended", "Session Ended"),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="events")
    event_type = models.CharField(max_length=30, choices=EVENT_TYPES)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    sequence_number = models.IntegerField()

    class Meta:
        ordering = ["sequence_number"]
        unique_together = [("room", "sequence_number")]
        indexes = [
            models.Index(fields=["room", "sequence_number"]),
            models.Index(fields=["room", "event_type"]),
        ]

    def __str__(self):
        return f"[{self.sequence_number}] {self.event_type} in Room {self.room.code}"


class Score(models.Model):
    """
    Cached leaderboard scores, computed from event replay.
    Can be recomputed on demand from the event log.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name="scores")
    participant = models.ForeignKey(
        Participant, on_delete=models.CASCADE, related_name="scores"
    )
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name="scores")
    points = models.IntegerField(default=0)
    calibration_score = models.FloatField(default=0.0)

    class Meta:
        unique_together = [("participant", "room")]

    def __str__(self):
        return f"{self.participant.display_name}: {self.points}pts"


class DebriefReport(models.Model):
    """Auto-generated post-session narrative report (Phase 8)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    room = models.OneToOneField(
        Room, on_delete=models.CASCADE, related_name="debrief"
    )
    narrative_text = models.TextField(blank=True)
    suggested_questions = models.JSONField(default=list, blank=True)
    cluster_summary = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Debrief for Room {self.room.code}"
