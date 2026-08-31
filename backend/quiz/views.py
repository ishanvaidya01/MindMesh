"""
REST API Views for MindMesh.
"""

from rest_framework import generics, status, views
from rest_framework.response import Response

from .models import (
    DebriefReport,
    Participant,
    Quiz,
    Room,
    Score,
)
from .serializers import (
    DebriefReportSerializer,
    JoinRoomSerializer,
    QuizCreateSerializer,
    QuizListSerializer,
    QuizSerializer,
    RoomCreateSerializer,
    RoomSerializer,
    ScoreSerializer,
)
from .event_engine import compute_leaderboard, replay_events
from .clustering import compute_all_clusters, get_cluster_graph_data
from .branching import get_branch_tree
from django.http import StreamingHttpResponse
from rest_framework.parsers import MultiPartParser
from pydantic import BaseModel, Field
import pymupdf as fitz
import json
from django.conf import settings

class GeneratedOption(BaseModel):
    text: str
    is_correct: bool
    misconception_tag: str | None = Field(description="Short descriptive tag like 'sign_error' or 'off_by_one' if wrong, null if correct")

class GeneratedQuestion(BaseModel):
    text: str
    explanation: str = Field(description="A clear, detailed 2-3 sentence explanation of WHY the correct answer is correct. Include the underlying concept and why wrong options are wrong.")
    time_limit_seconds: int = Field(default=30)
    options: list[GeneratedOption]

class GeneratedQuestionList(BaseModel):
    questions: list[GeneratedQuestion]

# ---------------------------------------------------------------------------
# Quiz CRUD
# ---------------------------------------------------------------------------

class QuizListCreateView(generics.ListCreateAPIView):
    """GET /api/quizzes/ — list all quizzes, POST — create a quiz."""
    
    def get_queryset(self):
        qs = Quiz.objects.all()
        creator_id = self.request.query_params.get("creator_id")
        if creator_id:
            qs = qs.filter(creator_id=creator_id)
        elif self.request.user.is_authenticated:
            qs = qs.filter(creator=self.request.user)
        return qs

    def get_serializer_class(self):
        if self.request.method == "POST":
            return QuizCreateSerializer
        return QuizListSerializer

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            serializer.save(creator=self.request.user)
        else:
            serializer.save()


class QuizDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/quizzes/<id>/"""
    queryset = Quiz.objects.prefetch_related("questions__options")
    serializer_class = QuizSerializer
    lookup_field = "id"


# ---------------------------------------------------------------------------
# Room management
# ---------------------------------------------------------------------------

class RoomCreateView(generics.CreateAPIView):
    """POST /api/rooms/ — create a new room."""
    serializer_class = RoomCreateSerializer


class RoomDetailView(generics.RetrieveAPIView):
    """GET /api/rooms/<code>/ — get room info by code."""
    serializer_class = RoomSerializer
    lookup_field = "code"

    def get_queryset(self):
        return Room.objects.prefetch_related("participants")


class RoomJoinView(views.APIView):
    """POST /api/rooms/<code>/join/ — join a room as participant."""

    def post(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response(
                {"error": "Room not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if room.status == "ended":
            return Response(
                {"error": "This room has ended", "room_status": "ended"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = JoinRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Check for duplicate display name
        display_name = serializer.validated_data["display_name"]
        if room.participants.filter(display_name=display_name, is_ghost=False).exists():
            return Response(
                {"error": "Display name already taken in this room"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        participant = Participant.objects.create(
            room=room,
            display_name=display_name,
            user=request.user if request.user.is_authenticated else None,
        )

        # If room is live, include current question so mid-session joiners start at right place
        current_q_data = None
        if room.status == "live" and room.current_question:
            q = room.current_question
            current_q_data = {
                "id": str(q.id),
                "text": q.text,
                "time_limit_seconds": q.time_limit_seconds,
                "order": q.order,
                "options": [
                    {"id": str(o.id), "text": o.text}
                    for o in q.options.all()
                ],
            }

        return Response(
            {
                "participant_id": str(participant.id),
                "session_token": str(participant.session_token),
                "room_code": room.code,
                "room_status": room.status,
                "display_name": participant.display_name,
                "current_question": current_q_data,
            },
            status=status.HTTP_201_CREATED,
        )


class RoomGhostJoinView(views.APIView):
    """POST /api/rooms/<code>/ghost-join/ — join an ended room as ghost."""

    def post(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response(
                {"error": "Room not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if room.status != "ended":
            return Response(
                {"error": "Ghost replay is only available for ended rooms"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = JoinRoomSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        participant = Participant.objects.create(
            room=room,
            display_name=serializer.validated_data["display_name"],
            is_ghost=True,
        )

        return Response(
            {
                "participant_id": str(participant.id),
                "session_token": str(participant.session_token),
                "room_code": room.code,
                "is_ghost": True,
            },
            status=status.HTTP_201_CREATED,
        )


class OfflineAttemptView(views.APIView):
    """
    POST /api/rooms/<code>/offline-attempt/
    Submit answers for an ended room and get an offline score + leaderboard.
    Answers format: [{"question_id": "...", "option_id": "...", "confidence": 50}, ...]
    """

    def post(self, request, code):
        from .scoring import compute_standard_score, compute_calibration_score

        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response({"error": "Room not found"}, status=status.HTTP_404_NOT_FOUND)

        # Load all questions and options for the room
        questions = {
            str(q.id): q
            for q in room.quiz.questions.prefetch_related("options").all()
        }
        options_map = {}
        for q in questions.values():
            for o in q.options.all():
                options_map[str(o.id)] = o

        answers = request.data.get("answers", [])
        display_name = request.data.get("display_name", "You")

        total_points = 0
        total_calibration = 0.0
        results = []

        for ans in answers:
            q_id = ans.get("question_id")
            o_id = ans.get("option_id")
            confidence = ans.get("confidence", 50)

            if q_id not in questions or o_id not in options_map:
                continue

            question = questions[q_id]
            option = options_map[o_id]
            is_correct = option.is_correct
            latency_ms = ans.get("latency_ms", 5000)

            pts = compute_standard_score(is_correct, latency_ms, question.time_limit_seconds * 1000)
            cal = compute_calibration_score(is_correct, confidence)

            total_points += pts
            total_calibration += cal

            # Find correct option
            correct_option = next((o for o in question.options.all() if o.is_correct), None)

            results.append({
                "question_id": q_id,
                "question_text": question.text,
                "selected_option_id": o_id,
                "selected_option_text": option.text,
                "is_correct": is_correct,
                "confidence": confidence,
                "points_earned": pts,
                "calibration_score": cal,
                "misconception_tag": option.misconception_tag if not is_correct else None,
                "correct_option_id": str(correct_option.id) if correct_option else None,
                "correct_option_text": correct_option.text if correct_option else None,
            })

        # Compute existing leaderboard
        state = replay_events(room)
        leaderboard = compute_leaderboard(room, state)

        # Inject ghost entry
        avg_calibration = round(total_calibration / len(results), 4) if results else 0.0
        ghost_entry = {
            "participant_id": "offline_ghost",
            "display_name": f"{display_name} (Offline)",
            "points": total_points,
            "calibration_score": avg_calibration,
            "is_ghost": True,
        }

        # Merge and sort leaderboard
        merged = list(leaderboard) + [ghost_entry]
        merged.sort(key=lambda x: x.get("points", 0), reverse=True)
        for i, entry in enumerate(merged):
            entry["rank"] = i + 1

        return Response({
            "offline_leaderboard": merged,
            "your_score": ghost_entry,
            "results": results,
            "total_questions": len(questions),
            "answered": len(results),
        })


class MyReviewView(views.APIView):
    """
    GET /api/rooms/<code>/my-review/?session_token=<token>
    Returns this participant's answers with correct answers and analysis.
    """

    def get(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response({"error": "Room not found"}, status=status.HTTP_404_NOT_FOUND)

        session_token = request.query_params.get("session_token")
        participant = None

        if session_token:
            try:
                participant = Participant.objects.get(session_token=session_token, room=room)
            except Participant.DoesNotExist:
                pass

        # Also check authenticated user's participant
        if not participant and request.user.is_authenticated:
            participant = room.participants.filter(user=request.user).first()

        if not participant:
            return Response({"error": "Participant not found"}, status=status.HTTP_404_NOT_FOUND)

        # Get state and find this participant's answers
        state = replay_events(room)
        p_id = str(participant.id)
        p_answers = state.answers.get(p_id, [])

        review_data = []
        for q in room.quiz.questions.prefetch_related("options").order_by("order"):
            q_id = str(q.id)

            # Find participant's answer for this question
            p_answer = next((a for a in p_answers if a.question_id == q_id), None)

            correct_option = next((o for o in q.options.all() if o.is_correct), None)

            question_entry = {
                "question_id": q_id,
                "question_text": q.text,
                "explanation": q.explanation or "",
                "order": q.order,
                "options": [
                    {
                        "id": str(o.id),
                        "text": o.text,
                        "is_correct": o.is_correct,
                        "misconception_tag": o.misconception_tag,
                    }
                    for o in q.options.all()
                ],
                "correct_option_id": str(correct_option.id) if correct_option else None,
                "your_answer": None,
            }

            if p_answer:
                question_entry["your_answer"] = {
                    "option_id": p_answer.option_id,
                    "is_correct": p_answer.is_correct,
                    "confidence": p_answer.confidence,
                    "misconception_tag": p_answer.misconception_tag,
                    "latency_ms": p_answer.latency_ms,
                }

            review_data.append(question_entry)

        # Get their score
        p_score = state.scores.get(p_id, {"points": 0, "calibration": 0.0})

        return Response({
            "room_code": code,
            "quiz_title": room.quiz.title,
            "display_name": participant.display_name,
            "total_points": p_score.get("points", 0),
            "calibration_score": p_score.get("calibration", 0.0),
            "questions": review_data,
            "total_answered": len(p_answers),
            "total_correct": sum(1 for a in p_answers if a.is_correct),
        })


# ---------------------------------------------------------------------------
# History & Scores
# ---------------------------------------------------------------------------

class RoomHistoryView(views.APIView):
    """GET /api/rooms/<code>/history/ — full session history."""

    def get(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response(
                {"error": "Room not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        state = replay_events(room)
        leaderboard = compute_leaderboard(room, state)
        clusters = compute_all_clusters(state)

        participants = {
            str(p.id): p.display_name
            for p in room.participants.filter(is_ghost=False)
        }

        # Build per-question breakdown
        questions_data = []
        for q in room.quiz.questions.prefetch_related("options").order_by("order"):
            q_id = str(q.id)
            q_answers = {}
            for pid, answers in state.answers.items():
                for ans in answers:
                    if ans.question_id == q_id:
                        q_answers[pid] = {
                            "option_id": ans.option_id,
                            "is_correct": ans.is_correct,
                            "confidence": ans.confidence,
                            "latency_ms": ans.latency_ms,
                            "misconception_tag": ans.misconception_tag,
                        }

            questions_data.append({
                "question_id": q_id,
                "text": q.text,
                "order": q.order,
                "answers": q_answers,
                "options": [
                    {
                        "id": str(o.id),
                        "text": o.text,
                        "is_correct": o.is_correct,
                        "misconception_tag": o.misconception_tag,
                    }
                    for o in q.options.all()
                ],
            })

        return Response({
            "room_code": room.code,
            "quiz_title": room.quiz.title,
            "status": room.status,
            "host": room.host,
            "created_at": room.created_at,
            "participants": participants,
            "leaderboard": leaderboard,
            "clusters": clusters,
            "questions": questions_data,
            "branch_path": state.branch_path,
        })


class RoomScoresView(generics.ListAPIView):
    """GET /api/rooms/<code>/scores/ — participant scores."""
    serializer_class = ScoreSerializer

    def get_queryset(self):
        code = self.kwargs["code"]
        return Score.objects.filter(room__code=code).select_related("participant")


class RoomListView(generics.ListAPIView):
    """GET /api/rooms/ — list all rooms (for history page)."""
    serializer_class = RoomSerializer
    queryset = Room.objects.prefetch_related("participants").all()


# ---------------------------------------------------------------------------
# Cluster & Branch data
# ---------------------------------------------------------------------------

class ClusterGraphView(views.APIView):
    """GET /api/rooms/<code>/clusters/ — cluster graph data."""

    def get(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response({"error": "Room not found"}, status=404)

        state = replay_events(room)
        participants = {
            str(p.id): p.display_name
            for p in room.participants.filter(is_ghost=False)
        }
        question_id = request.query_params.get("question_id")
        graph = get_cluster_graph_data(state, question_id, participants)
        return Response(graph)


class BranchTreeView(views.APIView):
    """GET /api/rooms/<code>/branch-tree/ — branch tree structure."""

    def get(self, request, code):
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response({"error": "Room not found"}, status=404)

        tree = get_branch_tree(str(room.quiz.id))
        state = replay_events(room)
        tree["path_taken"] = state.branch_path
        return Response(tree)


# ---------------------------------------------------------------------------
# Debrief
# ---------------------------------------------------------------------------

class DebriefView(generics.RetrieveAPIView):
    """GET /api/rooms/<code>/debrief/ — debrief report."""
    serializer_class = DebriefReportSerializer

    def get_object(self):
        code = self.kwargs["code"]
        try:
            return DebriefReport.objects.get(room__code=code)
        except DebriefReport.DoesNotExist:
            return None

    def retrieve(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj is None:
            return Response(
                {"status": "pending", "message": "Debrief report is being generated..."},
                status=status.HTTP_202_ACCEPTED,
            )
        return Response(self.get_serializer(obj).data)


# ---------------------------------------------------------------------------
# PDF Upload Processing
# ---------------------------------------------------------------------------

class UploadPDFView(views.APIView):
    """POST /api/quizzes/upload-pdf/ — accepts a PDF and returns SSE with extracted questions."""
    parser_classes = [MultiPartParser]

    def post(self, request, *args, **kwargs):
        file = request.FILES.get('file')
        if not file:
            return Response({"error": "No file provided"}, status=400)
            
        if file.size > 5 * 1024 * 1024:
            return Response({"error": "File size exceeds 5MB limit"}, status=400)
            
        try:
            doc = fitz.open(stream=file.read(), filetype="pdf")
        except Exception:
            return Response({"error": "Invalid PDF file"}, status=400)
            
        if doc.page_count > 20:
            doc.close()
            return Response({"error": "PDF exceeds 20 pages limit"}, status=400)

        def stream_processing():
            from google import genai
            from google.genai import types
            
            import os
            api_key = os.environ.get("GEMINI_API_KEY", os.environ.get("OPENAI_API_KEY", ""))
            if not api_key:
                yield f"data: {json.dumps({'status': 'error', 'message': 'API key not configured'})}\n\n"
                return

            client = genai.Client(api_key=api_key)
            total_pages = doc.page_count
            
            for page_num in range(total_pages):
                yield f"data: {json.dumps({'status': 'processing', 'page': page_num + 1, 'total': total_pages})}\n\n"
                
                page = doc[page_num]
                text = page.get_text().strip()
                
                parts = [
                    "Extract multiple-choice questions from this content. Return a JSON object with a 'questions' array. "
                    "For EACH question:\n"
                    "1. Provide a clear 'explanation' (2-3 sentences) that explains WHY the correct answer is right. "
                    "Include the underlying concept, principle, or reasoning. Also briefly mention why common wrong answers are incorrect.\n"
                    "2. For EACH wrong option, provide a descriptive 'misconception_tag' (e.g., 'confuses_stack_with_queue', 'forgets_base_case', 'sign_error') "
                    "that captures the specific conceptual mistake a student would be making if they chose that option.\n"
                    "3. Set appropriate time_limit_seconds (15-60s depending on difficulty).\n"
                    "If the content does not look like quiz questions, return an empty array."
                ]
                
                if len(text) > 100:
                    parts.append(text)
                else:
                    pix = page.get_pixmap(dpi=150)
                    img_data = pix.tobytes("jpeg")
                    parts.append(
                        types.Part.from_bytes(data=img_data, mime_type="image/jpeg")
                    )
                
                try:
                    response = client.models.generate_content(
                        model='gemini-3.6-flash',
                        contents=parts,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=GeneratedQuestionList,
                            temperature=0.2,
                        ),
                    )
                    
                    data = response.text
                    yield f"data: {json.dumps({'status': 'result', 'page': page_num + 1, 'data': json.loads(data)})}\n\n"
                    
                except Exception as e:
                    yield f"data: {json.dumps({'status': 'error', 'page': page_num + 1, 'message': str(e)})}\n\n"
            
            doc.close()
            yield f"data: {json.dumps({'status': 'done'})}\n\n"

        return StreamingHttpResponse(stream_processing(), content_type='text/event-stream')


class RoomResetView(views.APIView):
    """
    POST /api/rooms/<code>/reset/
    Host resets the room to lobby — clears quiz events so the quiz can restart.
    Existing Score records (best scores per participant) are preserved.
    Requires host_token in request body for authentication.
    """

    def post(self, request, code):
        host_token = request.data.get("host_token")
        try:
            room = Room.objects.get(code=code)
        except Room.DoesNotExist:
            return Response({"error": "Room not found"}, status=status.HTTP_404_NOT_FOUND)

        # Verify host token
        if not host_token or str(room.host_token) != host_token:
            return Response({"error": "Invalid host token"}, status=status.HTTP_403_FORBIDDEN)

        from .models import QuizEvent
        # Delete all events — this resets the quiz state
        QuizEvent.objects.filter(room=room).delete()
        # Reset room to lobby
        Room.objects.filter(id=room.id).update(status="lobby", current_question=None)

        return Response({"status": "reset", "room_code": code})
