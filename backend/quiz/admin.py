from django.contrib import admin

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


class OptionInline(admin.TabularInline):
    model = Option
    extra = 1


class QuestionInline(admin.StackedInline):
    model = Question
    extra = 0
    show_change_link = True


@admin.register(Quiz)
class QuizAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "created_at")
    inlines = [QuestionInline]


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("text", "quiz", "order", "time_limit_seconds")
    list_filter = ("quiz",)
    inlines = [OptionInline]


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ("code", "quiz", "host", "status", "created_at")
    list_filter = ("status",)


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ("display_name", "room", "is_ghost", "signal_tokens", "joined_at")
    list_filter = ("is_ghost",)


@admin.register(QuizEvent)
class QuizEventAdmin(admin.ModelAdmin):
    list_display = ("sequence_number", "event_type", "room", "created_at")
    list_filter = ("event_type", "room")
    ordering = ("-created_at",)


@admin.register(Score)
class ScoreAdmin(admin.ModelAdmin):
    list_display = ("participant", "room", "points", "calibration_score")


@admin.register(DebriefReport)
class DebriefReportAdmin(admin.ModelAdmin):
    list_display = ("room", "created_at")
