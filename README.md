<div align="center">
  
# 🧠 MindMesh

**The Next-Generation Collaborative Learning & Assessment Platform**

[![React](https://img.shields.io/badge/React-18-blue.svg?style=for-the-badge&logo=react)](https://reactjs.org/)
[![Django](https://img.shields.io/badge/Django-5.0-092E20.svg?style=for-the-badge&logo=django)](https://www.djangoproject.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Enabled-lightgrey.svg?style=for-the-badge)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![AI Powered](https://img.shields.io/badge/AI-Powered-purple.svg?style=for-the-badge)](#)

*MindMesh is an intelligent, real-time, event-sourced assessment platform that goes beyond simple multiple-choice questions. It uses advanced calibration scoring and AI-driven insights to help educators truly understand student comprehension.*

[Features](#features) • [Why MindMesh?](#how-mindmesh-beats-the-competition) • [Architecture](#architecture) • [Getting Started](#getting-started)

</div>

---

## ✨ Features

- ⚡ **Real-Time Synchronized Quizzes**: WebSocket-powered live rooms where hosts control the pace and students answer in real-time.
- 🎯 **Confidence Calibration Scoring**: Brier-derived proper scoring rule that rewards *confident-correct* answers and penalizes *confident-wrong* answers. It eliminates blind guessing!
- 🤖 **AI-Powered Question Generation**: Upload a PDF document and our AI instantly generates a full quiz complete with distractors, misconception tags, and detailed explanations.
- 💡 **Socratic AI Hints**: Students can request hints during a live quiz. The AI analyzes their specific misconception traps and provides gentle, Socratic nudges.
- 📊 **Dynamic Host Dashboard**: Hosts get real-time vertical bar graphs of student progress and live clustering of common misconceptions/traps.
- 🔄 **Time-Machine Rewind**: Thanks to an event-sourced architecture, hosts can rewind the quiz state to re-explain a difficult concept.
- 🎓 **Rich Post-Quiz Analysis**: Students receive a granular breakdown of their performance, complete with AI explanations for correct answers and actionable advice for their specific mistakes.
- 🔁 **Practice Mode**: Students can retake completed quizzes in practice mode to reinforce concepts without affecting the live leaderboard.

---

## 🏆 How MindMesh Beats the Competition

While platforms like **Kahoot!** and **Quizizz** are great for gamified engagement, they fall short when it comes to deep pedagogical insights and true learning. Here's how MindMesh stands out:

| Feature | MindMesh | Kahoot! / Quizizz |
|---------|----------|-------------------|
| **Core Metric** | Confidence Calibration + Accuracy | Speed + Accuracy |
| **Guessing Penalty** | High (Penalizes confident-wrong answers) | None (Encourages blind guessing) |
| **AI Integration** | Deep (Socratic hints, misconception clustering) | Surface-level (Simple question generation) |
| **Architecture** | Event-Sourced (Rewindable, auditable) | CRUD State (Overwrites history) |
| **Host Insights** | Real-time Misconception Traps & Clusters | Basic Leaderboards & Percentages |
| **Feedback Loop** | Detailed AI explanations per student | Standard correct/incorrect checkmark |

**In short:** Kahoot is a game. **MindMesh is an intelligent learning companion.**

---

## 🏗️ Architecture

MindMesh is built on a robust, scalable, and auditable architecture designed for real-time concurrency.

### Event-Sourced Engine
At the heart of the backend is the **Event Engine**. Instead of mutating state (e.g., updating a student's score in a database row), every action is recorded as an immutable `QuizEvent` (e.g., `question_shown`, `answer_submitted`, `host_rewound`). 
- **The true state of a room is derived by replaying these events.**
- This allows for features like **Time-Machine Rewind** and guarantees absolute auditability of a session.

### Tech Stack
* **Frontend:**
  * **React.js (Vite)** for lightning-fast UI rendering.
  * **Zustand** for lightweight, predictable state management.
  * **Framer Motion** for fluid, dynamic micro-animations that make the UI feel premium and alive.
  * **Vanilla CSS** with a robust CSS-variable design system (Glassmorphism, rich gradients, dynamic typography).
* **Backend:**
  * **Django & Django REST Framework** for robust API endpoints and ORM.
  * **Django Channels (WebSockets)** & **Redis** for sub-millisecond real-time communication between host and students.
  * **Celery** for asynchronous background tasks (like generating post-quiz debriefs).
  * **AI Integration** for PDF parsing, OCR, and Socratic hint generation.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Redis (for WebSockets)

### 1. Clone the repository
```bash
git clone https://github.com/ishanvaidya01/MindMesh.git
cd MindMesh
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start the Django development server (ASGI)
python manage.py runserver
```

### 3. Frontend Setup
```bash
cd frontend
npm install

# Start the Vite development server
npm run dev
```

### 4. Run Redis (Required for WebSockets)
Make sure you have a Redis server running locally on port 6379 for Django Channels to handle real-time events.

---

## 🎨 UI/UX Design Philosophy

MindMesh was designed with a **premium, vibrant aesthetic**. 
- We completely avoid generic colors, utilizing curated HSL palettes, sleek dark modes, and glassmorphism.
- Every interaction is accompanied by subtle micro-animations (via Framer Motion) to ensure the application feels responsive, dynamic, and alive.

---

<div align="center">
  <i>Built with ❤️ for the future of collaborative learning.</i>
</div>
