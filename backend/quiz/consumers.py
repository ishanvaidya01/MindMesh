"""
WebSocket Consumer for MindMesh real-time quiz rooms.

Core invariant: persist event FIRST, THEN broadcast.
Never broadcast-then-persist — this keeps replay consistent.

All state mutations flow through the event engine.
"""

from __future__ import annotations

import json
import logging
import asyncio

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import Option, Participant, Question, Room
from .event_engine import (
    append_event,
    compute_leaderboard,
    replay_events,
    persist_scores,
)
from .clustering import (
    compute_clusters_for_question,
    get_cluster_graph_data,
    get_lifeline_graph_data,
)
from .branching import evaluate_branch, get_next_question, get_branch_tree

logger = logging.getLogger(__name__)


class RoomConsumer(AsyncWebsocketConsumer):
    """
    WebSocket consumer for a quiz room.
    URL: ws/room/<room_code>/
    """

    async def connect(self):
        self.room_code = self.scope["url_route"]["kwargs"]["room_code"]
        self.room_group_name = f"room_{self.room_code}"
        self.participant_id = None
        self.is_host = False
        self.session_token = None
        # Per-student question tracking (question_id → index into quiz question list)
        self.student_question_index = -1  # index into ordered quiz questions

        # Verify room exists
        room = await self._get_room()
        if not room:
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name,
        )
        await self.accept()

        # Send current state snapshot
        state_data = await self._get_full_state()
        await self.send(text_data=json.dumps({
            "type": "state_sync",
            **state_data,
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name,
        )

    async def receive(self, text_data):
        """Route incoming messages to handlers."""
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Invalid JSON",
            }))
            return

        msg_type = data.get("type")
        handler = {
            "join_room": self._handle_join,
            "authenticate": self._handle_authenticate,
            "question_pushed": self._handle_question_push,
            "answer_submitted": self._handle_answer,
            "host_pause": self._handle_pause,
            "host_resume": self._handle_resume,
            "end_session": self._handle_end_session,
            "student_advance": self._handle_student_advance,
            "host_reset_room": self._handle_reset_room,
            "request_hint": self._handle_request_hint,
        }.get(msg_type)

        if handler:
            await handler(data)
        else:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": f"Unknown message type: {msg_type}",
            }))

    # -----------------------------------------------------------------------
    # Message handlers
    # -----------------------------------------------------------------------

    async def _handle_authenticate(self, data):
        """Authenticate as participant or host using session token."""
        session_token = data.get("session_token")
        host_token = data.get("host_token")

        if host_token:
            room = await self._get_room()
            if room and str(room.host_token) == host_token:
                self.is_host = True
                self.session_token = host_token
                await self.send(text_data=json.dumps({
                    "type": "authenticated",
                    "role": "host",
                    "host_name": room.host,
                }))
                return

        if session_token:
            participant = await self._get_participant_by_token(session_token)
            if participant:
                self.participant_id = str(participant.id)
                self.session_token = session_token

                # --- Reconnection: restore student question progress ---
                restored = await self._restore_student_progress(participant)

                await self.send(text_data=json.dumps({
                    "type": "authenticated",
                    "role": "participant",
                    "participant_id": self.participant_id,
                    "display_name": participant.display_name,
                }))

                # If student was mid-quiz, re-send their current question
                if restored:
                    await self.send(text_data=json.dumps(restored))
                return

        await self.send(text_data=json.dumps({
            "type": "error",
            "message": "Authentication failed",
        }))

    async def _handle_join(self, data):
        """Handle participant announcing their presence in the room."""
        session_token = data.get("session_token")
        participant = await self._get_participant_by_token(session_token)

        if not participant:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Invalid session token",
            }))
            return

        self.participant_id = str(participant.id)
        self.session_token = session_token

        # Broadcast new participant to room
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "participant_joined",
                "participant_id": str(participant.id),
                "display_name": participant.display_name,
            },
        )

    async def _handle_question_push(self, data):
        """Host pushes the next question to all participants."""
        if not self.is_host:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Only the host can push questions",
            }))
            return

        room = await self._get_room()
        question_id = data.get("question_id")

        if not question_id:
            # Auto-determine next question
            question_id = await self._get_next_question_id(room)

        if not question_id:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "No more questions available",
            }))
            return

        question_data = await self._get_question_data(question_id)
        if not question_data:
            return

        # Update room status and current question
        await self._update_room_question(room, question_id)

        # Persist event FIRST
        await database_sync_to_async(append_event)(
            room=room,
            event_type="question_shown",
            payload={
                "question_id": question_id,
                "text": question_data["text"],
                "time_limit_seconds": question_data["time_limit_seconds"],
            },
        )

        # Replay state to get accurate question index
        state = await database_sync_to_async(replay_events)(room)
        all_questions = await self._get_all_questions_for_room(room)
        total_questions = len(all_questions)

        # THEN broadcast (include status so clients transition immediately)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "question_pushed",
                "question": question_data,
                "status": "live",
                "question_index": getattr(state, 'current_question_index', 0),
                "total_questions": total_questions,
            },
        )

        # Queue AI hint task — fires when timer < 15s remain
        try:
            from .tasks import generate_ai_hint
            time_limit = question_data.get("time_limit_seconds", 30)
            generate_ai_hint.apply_async(
                args=[str(room.id), question_id, time_limit],
                countdown=0,  # Start immediately — the task itself sleeps internally
            )
        except Exception as e:
            logger.warning("Could not queue hint task: %s", e)

    async def _handle_answer(self, data):
        """Participant submits an answer."""
        if not self.participant_id:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "Not authenticated as participant",
            }))
            return

        room = await self._get_room()
        option_id = data.get("option_id")
        confidence = data.get("confidence", 50)
        latency_ms = data.get("latency_ms", 0)

        if not option_id:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "option_id is required",
            }))
            return

        question_id = data.get("question_id")
        if not question_id and room.current_question:
            question_id = str(room.current_question.id)

        is_practice = data.get("practice", False)

        if not is_practice:
            # Persist event FIRST (only for real attempts)
            event = await database_sync_to_async(append_event)(
                room=room,
                event_type="answer_submitted",
                payload={
                    "participant_id": self.participant_id,
                    "option_id": option_id,
                    "question_id": question_id,
                    "confidence": confidence,
                    "latency_ms": latency_ms,
                },
            )

        # Get option info for immediate feedback
        option_info = await self._get_option_info(option_id)

        # Send answer confirmation to the submitter
        await self.send(text_data=json.dumps({
            "type": "answer_confirmed",
            "is_correct": option_info.get("is_correct", False),
            "misconception_tag": option_info.get("misconception_tag"),
            "practice": is_practice,
        }))

        # Skip leaderboard/stats broadcasts for practice mode
        if is_practice:
            return


        # Compute updated state and broadcast
        state = await database_sync_to_async(replay_events)(room)
        leaderboard = await database_sync_to_async(compute_leaderboard)(room, state)

        # Broadcast leaderboard update
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "leaderboard_update",
                "leaderboard": leaderboard,
            },
        )

        # Broadcast cluster update
        if question_id:
            clusters = await database_sync_to_async(
                compute_clusters_for_question
            )(state, question_id)

            participant_names = await self._get_participant_names(room)
            graph_data = await database_sync_to_async(get_cluster_graph_data)(
                state, question_id, participant_names
            )

            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "cluster_update",
                    "clusters": clusters,
                    "graph_data": graph_data,
                    "question_id": question_id,
                },
            )

        # Broadcast answer count (for host live view)
        # Build per-question count map for the answer distribution chart
        question_counts = {}  # question_id → count
        correct_counts = {}   # question_id → correct count
        for p_answers in state.answers.values():
            for ans in p_answers:
                q = ans.question_id
                question_counts[q] = question_counts.get(q, 0) + 1
                if ans.is_correct:
                    correct_counts[q] = correct_counts.get(q, 0) + 1

        total_participants = await self._get_participant_count(room)
        # Count answers for current question only
        current_answer_count = question_counts.get(question_id, 0) if question_id else 0

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "answer_stats",
                "question_id": question_id,
                "answers_received": current_answer_count,
                "total_participants": total_participants,
                "question_counts": question_counts,
                "correct_counts": correct_counts,
            },
        )

    async def _handle_pause(self, data):
        """Host pauses the session."""
        if not self.is_host:
            return

        room = await self._get_room()
        await database_sync_to_async(append_event)(
            room=room, event_type="host_paused", payload={},
        )
        await self._update_room_status(room, "paused")

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "session_paused"},
        )

    async def _handle_resume(self, data):
        """Host resumes the session."""
        if not self.is_host:
            return

        room = await self._get_room()
        await database_sync_to_async(append_event)(
            room=room, event_type="host_resumed", payload={},
        )
        await self._update_room_status(room, "live")

        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "session_resumed"},
        )

    async def _handle_rewind(self, data):
        """Host rewinds to a specific sequence number."""
        if not self.is_host:
            return

        room = await self._get_room()
        target_sequence = data.get("to_sequence_number", 0)

        # Persist the rewind event
        await database_sync_to_async(append_event)(
            room=room,
            event_type="host_rewound",
            payload={"to_sequence_number": target_sequence},
        )

        # Replay to target sequence
        state = await database_sync_to_async(replay_events)(
            room, up_to_sequence=target_sequence
        )

        # Build full state for broadcast
        leaderboard = await database_sync_to_async(compute_leaderboard)(room, state)
        participant_names = await self._get_participant_names(room)

        state_data = {
            "status": state.status,
            "current_question_id": state.current_question_id,
            "current_question_index": state.current_question_index,
            "leaderboard": leaderboard,
            "rewound_to": target_sequence,
            "last_sequence": state.last_sequence,
        }

        if state.current_question_id:
            question_data = await self._get_question_data(state.current_question_id)
            state_data["question"] = question_data

            clusters = await database_sync_to_async(
                compute_clusters_for_question
            )(state, state.current_question_id)
            graph_data = await database_sync_to_async(get_cluster_graph_data)(
                state, state.current_question_id, participant_names
            )
            state_data["clusters"] = clusters
            state_data["graph_data"] = graph_data

        # Broadcast full state sync to ALL clients
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "full_state_sync",
                **state_data,
            },
        )

    async def _handle_lifeline(self, data):
        """Participant sends an anonymous lifeline signal."""
        if not self.participant_id:
            return

        room = await self._get_room()
        to_participant_id = data.get("to_participant_id")

        # Check signal tokens
        participant = await self._get_participant_by_id(self.participant_id)
        if not participant or participant.signal_tokens <= 0:
            await self.send(text_data=json.dumps({
                "type": "error",
                "message": "No signal tokens remaining",
            }))
            return

        # Decrement token
        await self._decrement_signal_tokens(participant)

        # Persist event FIRST
        await database_sync_to_async(append_event)(
            room=room,
            event_type="lifeline_sent",
            payload={
                "from_participant_id": self.participant_id,
                "to_participant_id": to_participant_id,
                "question_id": str(room.current_question.id) if room.current_question else None,
            },
        )

        # Broadcast anonymized lifeline (hide sender identity)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "lifeline_received",
                "to_participant_id": to_participant_id,
                "tokens_remaining": participant.signal_tokens - 1,
            },
        )

        # Update lifeline graph
        state = await database_sync_to_async(replay_events)(room)
        participant_names = await self._get_participant_names(room)
        lifeline_graph = await database_sync_to_async(get_lifeline_graph_data)(
            state, participant_names
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "lifeline_graph_update",
                "graph_data": lifeline_graph,
            },
        )

    async def _handle_end_session(self, data):
        """Host ends the session."""
        if not self.is_host:
            return

        room = await self._get_room()

        # Persist event
        await database_sync_to_async(append_event)(
            room=room, event_type="session_ended", payload={},
        )
        await self._update_room_status(room, "ended")

        # Persist final scores
        await database_sync_to_async(persist_scores)(room)

        # Trigger debrief generation
        try:
            from .tasks import generate_debrief
            generate_debrief.delay(str(room.id))
        except Exception as e:
            logger.warning("Failed to queue debrief task: %s", e)

        # Compute final leaderboard
        state = await database_sync_to_async(replay_events)(room)
        leaderboard = await database_sync_to_async(compute_leaderboard)(room, state)

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "session_ended_broadcast",
                "leaderboard": leaderboard,
                "room_code": room.code,
            },
        )

    async def _handle_pulse(self, data):
        """Student sends a confusion/got-it pulse signal."""
        if not self.participant_id:
            return
        mood = data.get("mood", "confused")  # 'confused' | 'got_it'
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "pulse_update",
                "participant_id": self.participant_id,
                "mood": mood,
            },
        )

    async def _handle_prediction(self, data):
        """Student submits their prediction for class accuracy."""
        if not self.participant_id:
            return
        prediction_pct = data.get("prediction_pct", 50)
        question_id = data.get("question_id")
        room = await self._get_room()
        await database_sync_to_async(append_event)(
            room=room,
            event_type="answer_submitted",  # reuse the log
            payload={
                "participant_id": self.participant_id,
                "event_subtype": "prediction",
                "prediction_pct": prediction_pct,
                "question_id": question_id,
            },
        )
        # Will be resolved when question ends

    async def _handle_reaction(self, data):
        """Student sends an emoji reaction after a question reveal."""
        if not self.participant_id:
            return
        reaction = data.get("reaction")  # 'mind_blown' | 'confused' | 'easy' | 'tricky'
        question_id = data.get("question_id")
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "reaction_update",
                "participant_id": self.participant_id,
                "reaction": reaction,
                "question_id": question_id,
            },
        )

    async def _handle_request_hint(self, data):
        """Student requests an AI hint for the current question.
        Generates a Socratic hint from the question's options and misconception tags.
        """
        if not self.participant_id:
            return

        question_id = data.get("question_id")
        if not question_id:
            return

        # Check if we already sent a hint for this question to this student
        hint_key = f"{self.participant_id}_{question_id}"
        if not hasattr(self, '_sent_hints'):
            self._sent_hints = set()
        if hint_key in self._sent_hints:
            return
        self._sent_hints.add(hint_key)

        # Get the question and its options to generate a hint
        hint_text = await self._generate_hint(question_id)
        if hint_text:
            await self.send(text_data=json.dumps({
                "type": "hint_delivered",
                "question_id": question_id,
                "hint": hint_text,
            }))

    @database_sync_to_async
    def _generate_hint(self, question_id):
        """Generate a Socratic hint from the question's options and misconception tags."""
        from .models import Question
        try:
            question = Question.objects.prefetch_related("options").get(id=question_id)
        except Question.DoesNotExist:
            return None

        # Gather misconception tags from wrong options
        wrong_options = [o for o in question.options.all() if not o.is_correct]
        correct_option = next((o for o in question.options.all() if o.is_correct), None)
        misconception_tags = [o.misconception_tag for o in wrong_options if o.misconception_tag]

        # Build a Socratic hint — don't give away the answer
        hints = []
        if question.explanation:
            # Extract the core concept from the explanation without giving the answer
            explanation = question.explanation
            # Take first sentence as a conceptual nudge
            first_sentence = explanation.split('.')[0] + '.'
            hints.append(f"💡 Think about this: {first_sentence}")

        if misconception_tags:
            tag = misconception_tags[0].replace('_', ' ').title()
            hints.append(f"⚠️ Common mistake: Watch out for {tag.lower()}.")

        if correct_option:
            # Give a category hint without revealing the answer
            hints.append("🔍 Try eliminating options you're sure are wrong first.")

        if not hints:
            hints.append("🤔 Re-read the question carefully. Focus on the key terms.")

        return " ".join(hints[:2])  # Return max 2 hint parts

    async def _handle_student_advance(self, data):
        """Student advances to their next question independently (self-paced mode).
        Each participant has their own question pointer. The host only starts the session.
        After locking in an answer, the student calls this to get their next question.
        """
        if not self.participant_id:
            return

        room = await self._get_room()
        all_questions = await self._get_all_questions_for_room(room)

        if not all_questions:
            await self.send(text_data=json.dumps({"type": "student_quiz_complete", "message": "No questions found"}))
            return

        # On the FIRST advance (index is still -1), sync to the host's current
        # question position so we advance to the NEXT one, not repeat Q1.
        if self.student_question_index == -1:
            if room.current_question:
                current_q_id = str(room.current_question.id)
                for i, q in enumerate(all_questions):
                    if q["id"] == current_q_id:
                        self.student_question_index = i
                        break

        # Advance this student's personal question index
        self.student_question_index += 1

        if self.student_question_index >= len(all_questions):
            # Student finished all questions — send completion
            await self.send(text_data=json.dumps({
                "type": "student_quiz_complete",
                "message": "You have completed all questions!",
            }))
            # Persist scores immediately so student can see them on dashboard
            await database_sync_to_async(persist_scores)(room)
            # Broadcast progress (student is done)
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "student_progress_update",
                    "participant_id": self.participant_id,
                    "question_index": self.student_question_index,
                    "total_questions": len(all_questions),
                    "completed": True,
                },
            )
            return

        # Send next question ONLY to this student
        next_question = all_questions[self.student_question_index]
        await self.send(text_data=json.dumps({
            "type": "student_question",
            "question": next_question,
            "question_index": self.student_question_index,
            "total_questions": len(all_questions),
        }))

        # Broadcast progress update to the room (host dashboard can track this)
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                "type": "student_progress_update",
                "participant_id": self.participant_id,
                "question_index": self.student_question_index,
                "total_questions": len(all_questions),
                "completed": False,
            },
        )

    async def _handle_reset_room(self, data):
        """Host resets the room to lobby state, clearing events. Best scores preserved."""
        if not self.is_host:
            return
        room = await self._get_room()
        await self._reset_room_state(room)
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "room_reset"},
        )

    # -----------------------------------------------------------------------
    # Group message handlers (called by channel_layer.group_send)
    # -----------------------------------------------------------------------

    async def participant_joined(self, event):
        await self.send(text_data=json.dumps({
            "type": "participant_joined",
            "participant_id": event["participant_id"],
            "display_name": event["display_name"],
        }))

    async def question_pushed(self, event):
        await self.send(text_data=json.dumps({
            "type": "question_pushed",
            "question": event["question"],
            "status": event.get("status", "live"),
            "question_index": event.get("question_index", 0),
            "total_questions": event.get("total_questions", 0),
        }))

    async def leaderboard_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "leaderboard_update",
            "leaderboard": event["leaderboard"],
        }))

    async def cluster_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "cluster_update",
            "clusters": event["clusters"],
            "graph_data": event["graph_data"],
            "question_id": event["question_id"],
        }))

    async def answer_stats(self, event):
        await self.send(text_data=json.dumps({
            "type": "answer_stats",
            "question_id": event["question_id"],
            "answers_received": event["answers_received"],
            "total_participants": event["total_participants"],
            "question_counts": event.get("question_counts", {}),
            "correct_counts": event.get("correct_counts", {}),
        }))

    async def pulse_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "pulse_update",
            "participant_id": event["participant_id"],
            "mood": event["mood"],
        }))

    async def reaction_update(self, event):
        await self.send(text_data=json.dumps({
            "type": "reaction_update",
            "participant_id": event["participant_id"],
            "reaction": event["reaction"],
            "question_id": event.get("question_id"),
        }))

    async def session_paused(self, event):
        await self.send(text_data=json.dumps({"type": "session_paused"}))

    async def session_resumed(self, event):
        await self.send(text_data=json.dumps({"type": "session_resumed"}))

    async def full_state_sync(self, event):
        """Send complete state snapshot — used for rewind."""
        data = {k: v for k, v in event.items() if k != "type"}
        data["type"] = "state_sync"
        await self.send(text_data=json.dumps(data))

    async def student_progress_update(self, event):
        """Relay student progress updates to host and others in the room."""
        await self.send(text_data=json.dumps({
            "type": "student_progress_update",
            "participant_id": event["participant_id"],
            "question_index": event["question_index"],
            "total_questions": event["total_questions"],
            "completed": event.get("completed", False),
        }))

    async def room_reset(self, event):
        """Notify all clients the room has been reset."""
        await self.send(text_data=json.dumps({"type": "room_reset"}))

    async def session_ended_broadcast(self, event):
        await self.send(text_data=json.dumps({
            "type": "session_ended",
            "leaderboard": event["leaderboard"],
            "room_code": event["room_code"],
        }))

    async def ghost_tick(self, event):
        await self.send(text_data=json.dumps({
            "type": "ghost_tick",
            **{k: v for k, v in event.items() if k != "type"},
        }))

    async def hint_delivered(self, event):
        """Broadcast AI hint to all participants in the room."""
        await self.send(text_data=json.dumps({
            "type": "hint_delivered",
            "question_id": event["question_id"],
            "hint_text": event["hint_text"],
            "question_text": event.get("question_text", ""),
        }))

    # -----------------------------------------------------------------------
    # Database helpers (all wrapped in database_sync_to_async)
    # -----------------------------------------------------------------------

    @database_sync_to_async
    def _get_room(self):
        try:
            return Room.objects.select_related("quiz", "current_question").get(
                code=self.room_code
            )
        except Room.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_participant_by_token(self, token):
        try:
            return Participant.objects.get(session_token=token)
        except Participant.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_participant_by_id(self, pid):
        try:
            return Participant.objects.get(id=pid)
        except Participant.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_participant_names(self, room):
        return {
            str(p.id): p.display_name
            for p in Participant.objects.filter(room=room, is_ghost=False)
        }

    @database_sync_to_async
    def _get_participant_count(self, room):
        return Participant.objects.filter(room=room, is_ghost=False).count()

    @database_sync_to_async
    def _get_question_data(self, question_id):
        try:
            q = Question.objects.prefetch_related("options").get(id=question_id)
            return {
                "id": str(q.id),
                "text": q.text,
                "time_limit_seconds": q.time_limit_seconds,
                "order": q.order,
                "options": [
                    {
                        "id": str(o.id),
                        "text": o.text,
                    }
                    for o in q.options.all()
                ],
            }
        except Question.DoesNotExist:
            return None

    @database_sync_to_async
    def _get_option_info(self, option_id):
        try:
            o = Option.objects.get(id=option_id)
            return {
                "is_correct": o.is_correct,
                "misconception_tag": o.misconception_tag,
            }
        except Option.DoesNotExist:
            return {}

    @database_sync_to_async
    def _get_next_question_id(self, room):
        """Determine the next question using branching or linear order."""
        if room.current_question:
            state = replay_events(room)
            total = Participant.objects.filter(room=room, is_ghost=False).count()
            next_q, reason = get_next_question(
                room, room.current_question, state, total
            )
            if next_q:
                return str(next_q.id)
            return None
        else:
            # First question: get the first in linear order
            first = Question.objects.filter(
                quiz=room.quiz, branch_parent__isnull=True
            ).order_by("order").first()
            return str(first.id) if first else None

    @database_sync_to_async
    def _update_room_question(self, room, question_id):
        Room.objects.filter(id=room.id).update(
            current_question_id=question_id,
            status="live",
        )

    @database_sync_to_async
    def _update_room_status(self, room, status):
        Room.objects.filter(id=room.id).update(status=status)

    @database_sync_to_async
    def _get_all_questions_for_room(self, room):
        """Return all questions for the room's quiz in order, with options."""
        questions = []
        qs = room.quiz.questions.prefetch_related("options").order_by("order")
        for q in qs:
            questions.append({
                "id": str(q.id),
                "text": q.text,
                "time_limit_seconds": q.time_limit_seconds,
                "order": q.order,
                "options": [
                    {"id": str(o.id), "text": o.text}
                    for o in q.options.all()
                ],
            })
        return questions

    @database_sync_to_async
    def _reset_room_state(self, room):
        """Reset room to lobby: delete events, clear current question & status."""
        from .models import QuizEvent
        # Preserve best scores per user before clearing
        # (Score records already exist from previous session via persist_scores)
        QuizEvent.objects.filter(room=room).delete()
        Room.objects.filter(id=room.id).update(
            status="lobby",
            current_question=None,
        )

    @database_sync_to_async
    def _restore_student_progress(self, participant):
        """
        On reconnect: replay this student's answer events to figure out
        which question they should be on next, then return that question
        as a student_question payload (or None if they're in the lobby / done).
        """
        from .models import QuizEvent
        room = Room.objects.select_related("quiz", "current_question").get(
            code=self.room_code
        )

        if room.status not in ("live", "paused"):
            return None

        # Get all questions in order
        all_questions = []
        for q in room.quiz.questions.prefetch_related("options").order_by("order"):
            all_questions.append({
                "id": str(q.id),
                "text": q.text,
                "time_limit_seconds": q.time_limit_seconds,
                "order": q.order,
                "options": [{"id": str(o.id), "text": o.text} for o in q.options.all()],
            })

        if not all_questions:
            return None

        # Count how many distinct questions this student has answered
        answered_question_ids = set(
            QuizEvent.objects.filter(
                room=room,
                event_type="answer_submitted",
                payload__participant_id=str(participant.id),
            ).values_list("payload__question_id", flat=True)
        )
        answered_count = len(answered_question_ids)

        # Their next question index
        next_index = answered_count
        self.student_question_index = next_index - 1  # will be incremented on next advance

        if next_index >= len(all_questions):
            # Student already finished — send completion
            return {
                "type": "student_quiz_complete",
                "message": "You have already completed all questions!",
            }

        # Determine current question: the one they SHOULD be on
        # If they haven't answered any questions yet, check if the host has
        # started (current_question is set) — put them on that same question
        if answered_count == 0 and room.current_question:
            # They haven't answered anything yet; host may have started
            # Put them on Q1 (index 0), which is what question_pushed already did
            return None

        # They answered some questions — resume at the next unanswered one
        next_question = all_questions[next_index]
        self.student_question_index = next_index  # already at this question

        return {
            "type": "student_question",
            "question": next_question,
            "question_index": next_index,
            "total_questions": len(all_questions),
            "resumed": True,
        }

    async def _get_full_state(self):
        """Build a full state snapshot for initial connection."""
        room = await self._get_room()
        if not room:
            return {"status": "error", "message": "Room not found"}

        state = await database_sync_to_async(replay_events)(room)
        leaderboard = await database_sync_to_async(compute_leaderboard)(room, state)
        participant_names = await self._get_participant_names(room)

        result = {
            "room_code": room.code,
            "status": room.status,
            "host": room.host,
            "current_question_id": state.current_question_id,
            "current_question_index": state.current_question_index,
            "leaderboard": leaderboard,
            "last_sequence": state.last_sequence,
            "participants": [
                {"id": pid, "name": name}
                for pid, name in participant_names.items()
            ],
        }

        # Include current question data if live
        if state.current_question_id:
            question_data = await self._get_question_data(state.current_question_id)
            result["question"] = question_data

            clusters = await database_sync_to_async(
                compute_clusters_for_question
            )(state, state.current_question_id)
            graph_data = await database_sync_to_async(get_cluster_graph_data)(
                state, state.current_question_id, participant_names
            )
            result["clusters"] = clusters
            result["graph_data"] = graph_data

        return result
