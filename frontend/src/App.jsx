import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from './stores/useAuthStore';
import HomePage from './pages/HomePage';
import CreateQuizPage from './pages/CreateQuizPage';
import JoinPage from './pages/JoinPage';
import LiveHostRoom from './pages/LiveHostRoom';
import QuizzesDashboard from './pages/QuizzesDashboard';
import LiveQuizPage from './pages/LiveQuizPage';
import HistoryPage from './pages/HistoryPage';
import DebriefPage from './pages/DebriefPage';
import SessionDetailPage from './pages/SessionDetailPage';
import AuthPage from './pages/AuthPage';
import StudentDashboard from './pages/StudentDashboard';

import PostQuizReviewPage from './pages/PostQuizReviewPage';

function App() {
  const fetchUser = useAuthStore(state => state.fetchUser);

  // Validate token on startup — silently, doesn't block rendering
  useEffect(() => {
    fetchUser();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                       element={<HomePage />} />
        <Route path="/auth"                   element={<AuthPage />} />
        <Route path="/create"                 element={<CreateQuizPage />} />
        <Route path="/join"                   element={<JoinPage />} />
        <Route path="/host/dashboard"         element={<QuizzesDashboard />} />
        <Route path="/host/:roomCode"         element={<LiveHostRoom />} />
        <Route path="/quiz/:roomCode"         element={<LiveQuizPage />} />
        <Route path="/student-dashboard"      element={<StudentDashboard />} />
        <Route path="/history"               element={<HistoryPage />} />
        <Route path="/history/:roomCode"      element={<SessionDetailPage />} />
        <Route path="/debrief/:roomCode"      element={<DebriefPage />} />

        <Route path="/review/:roomCode"       element={<PostQuizReviewPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
