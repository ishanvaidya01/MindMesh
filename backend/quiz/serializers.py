"""
DRF Serializers for MindMesh API.
"""

from rest_framework import serializers

from .models import (
    DebriefReport,
    Option,
    Participant,
    Question,
    Quiz,
    QuizEvent,
    Room,
    Score,
)


# ---------------------------------------------------------------------------
# Option
# ---------------------------------------------------------------------------

class OptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Option
        fields = ["id", "text", "is_correct", "misconception_tag"]


class OptionCreateSerializer(serializers.ModelSerializer):
    """Used when creating options as part of a question."""

    class Meta:
        model = Option
        fields = ["id", "text", "is_correct", "misconception_tag"]
        extra_kwargs = {"id": {"read_only": True}}


# ---------------------------------------------------------------------------
# Question
# ---------------------------------------------------------------------------

class QuestionSerializer(serializers.ModelSerializer):
    options = OptionSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = [
            "id", "text", "explanation", "time_limit_seconds", "order",
            "branch_parent", "branch_condition", "options",
        ]


class QuestionCreateSerializer(serializers.ModelSerializer):
    """Used when creating questions as part of a quiz."""
    options = OptionCreateSerializer(many=True)

    class Meta:
        model = Question
        fields = [
            "id", "text", "explanation", "time_limit_seconds", "order",
            "branch_parent", "branch_condition", "options",
        ]
        extra_kwargs = {"id": {"read_only": True}}

    def create(self, validated_data):
        options_data = validated_data.pop("options", [])
        question = Question.objects.create(**validated_data)
        for opt_data in options_data:
            Option.objects.create(question=question, **opt_data)
        return question


# ---------------------------------------------------------------------------
# Quiz
# ---------------------------------------------------------------------------

class QuizSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ["id", "title", "owner", "creator", "created_at", "questions", "question_count"]

    def get_question_count(self, obj):
        return obj.questions.count()


class QuizCreateSerializer(serializers.ModelSerializer):
    """Nested create: quiz + questions + options in a single POST."""
    questions = QuestionCreateSerializer(many=True)

    class Meta:
        model = Quiz
        fields = ["id", "title", "owner", "creator", "questions"]
        extra_kwargs = {"id": {"read_only": True}, "creator": {"read_only": True}}

    def create(self, validated_data):
        questions_data = validated_data.pop("questions", [])
        quiz = Quiz.objects.create(**validated_data)
        for q_data in questions_data:
            options_data = q_data.pop("options", [])
            question = Question.objects.create(quiz=quiz, **q_data)
            for opt_data in options_data:
                Option.objects.create(question=question, **opt_data)
        return quiz


class QuizListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""
    question_count = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ["id", "title", "owner", "created_at", "question_count"]

    def get_question_count(self, obj):
        return obj.questions.count()


# ---------------------------------------------------------------------------
# Room
# ---------------------------------------------------------------------------

class ParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Participant
        fields = ["id", "display_name", "joined_at", "is_ghost"]


class RoomSerializer(serializers.ModelSerializer):
    participants = ParticipantSerializer(many=True, read_only=True)
    quiz_title = serializers.CharField(source="quiz.title", read_only=True)
    participant_count = serializers.SerializerMethodField()

    class Meta:
        model = Room
        fields = [
            "id", "quiz", "quiz_title", "code", "host", "status",
            "current_question", "created_at", "participants", "participant_count",
        ]

    def get_participant_count(self, obj):
        return obj.participants.filter(is_ghost=False).count()


class RoomCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Room
        fields = ["id", "quiz", "host", "code", "host_token"]
        extra_kwargs = {
            "id": {"read_only": True},
            "code": {"read_only": True},
            "host_token": {"read_only": True},
        }

    def create(self, validated_data):
        validated_data["code"] = Room.generate_code()
        return super().create(validated_data)


class JoinRoomSerializer(serializers.Serializer):
    """Serializer for join room request."""
    display_name = serializers.CharField(max_length=100)


# ---------------------------------------------------------------------------
# Score
# ---------------------------------------------------------------------------

class ScoreSerializer(serializers.ModelSerializer):
    display_name = serializers.CharField(source="participant.display_name", read_only=True)

    class Meta:
        model = Score
        fields = ["id", "participant", "display_name", "points", "calibration_score"]


# ---------------------------------------------------------------------------
# Event (read-only)
# ---------------------------------------------------------------------------

class QuizEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizEvent
        fields = ["id", "event_type", "payload", "created_at", "sequence_number"]


# ---------------------------------------------------------------------------
# Debrief Report
# ---------------------------------------------------------------------------

class DebriefReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = DebriefReport
        fields = [
            "id", "room", "narrative_text", "suggested_questions",
            "cluster_summary", "created_at",
        ]
