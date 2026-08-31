from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth.models import User
from .models import Score, Quiz, Participant

class MyScoresView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        # Find scores linked directly via user field OR via participant.user
        scores = Score.objects.filter(
            Q(user=request.user) | Q(participant__user=request.user)
        ).select_related('room__quiz', 'participant').distinct()
        data = []
        for score in scores:
            data.append({
                "room_code": score.room.code,
                "quiz_title": score.room.quiz.title,
                "points": score.points,
                "calibration_score": score.calibration_score,
                "date": score.room.created_at
            })
        return Response(data)

class CreatorListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        creators = User.objects.filter(created_quizzes__isnull=False).distinct()
        data = [{"id": c.id, "username": c.username} for c in creators]
        return Response(data)

class CreatorQuizListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, creator_id):
        quizzes = Quiz.objects.filter(creator_id=creator_id)
        data = [{"id": q.id, "title": q.title, "created_at": q.created_at} for q in quizzes]
        return Response(data)
