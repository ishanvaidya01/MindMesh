"""
URL routing for MindMesh REST API.
"""

from django.urls import path

from . import views
from . import auth_views
from . import student_views

urlpatterns = [
    # Auth
    path("auth/register/", auth_views.RegisterView.as_view(), name="auth-register"),
    path("auth/login/", auth_views.LoginView.as_view(), name="auth-login"),
    path("auth/logout/", auth_views.LogoutView.as_view(), name="auth-logout"),
    path("auth/me/", auth_views.MeView.as_view(), name="auth-me"),
    path("auth/link-progress/", auth_views.LinkProgressView.as_view(), name="auth-link-progress"),

    # Student & Discoverability
    path("student/scores/", student_views.MyScoresView.as_view(), name="student-scores"),
    path("creators/", student_views.CreatorListView.as_view(), name="creator-list"),
    path("creators/<int:creator_id>/quizzes/", student_views.CreatorQuizListView.as_view(), name="creator-quizzes"),

    # Quiz CRUD
    path("quizzes/", views.QuizListCreateView.as_view(), name="quiz-list-create"),
    path("quizzes/<uuid:id>/", views.QuizDetailView.as_view(), name="quiz-detail"),
    path("quizzes/upload-pdf/", views.UploadPDFView.as_view(), name="quiz-upload-pdf"),

    # Room management
    path("rooms/", views.RoomListView.as_view(), name="room-list"),
    path("rooms/create/", views.RoomCreateView.as_view(), name="room-create"),
    path("rooms/<str:code>/", views.RoomDetailView.as_view(), name="room-detail"),
    path("rooms/<str:code>/join/", views.RoomJoinView.as_view(), name="room-join"),

    # History & Scores
    path("rooms/<str:code>/history/", views.RoomHistoryView.as_view(), name="room-history"),
    path("rooms/<str:code>/scores/", views.RoomScoresView.as_view(), name="room-scores"),
    path("rooms/<str:code>/my-review/", views.MyReviewView.as_view(), name="room-my-review"),

    # Cluster & Branch data
    path("rooms/<str:code>/clusters/", views.ClusterGraphView.as_view(), name="room-clusters"),
    path("rooms/<str:code>/branch-tree/", views.BranchTreeView.as_view(), name="room-branch-tree"),

    # Debrief
    path("rooms/<str:code>/debrief/", views.DebriefView.as_view(), name="room-debrief"),

    # Room reset (host restarts quiz from beginning)
    path("rooms/<str:code>/reset/", views.RoomResetView.as_view(), name="room-reset"),
]
