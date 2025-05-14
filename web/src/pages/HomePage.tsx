import React from 'react';
import { useNavigate } from 'react-router-dom';
import TopicSelector from '../components/TopicSelector';
import './HomePage.css';

const HomePage: React.FC = () => {
  const navigate = useNavigate();

  const handleTopicSelect = (topicId: string, topicName: string) => {
    navigate('/whiteboard', { state: { topicId, topicName } });
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="logo">
          <span className="logo-text">AI</span>
          <span className="logo-accent">Tutor</span>
        </div>
        <h1>Your Personal AI Tutor for Everything</h1>
        <p>Select a topic below or enter your own to get started with personalized, interactive learning.</p>
      </header>

      <main className="home-main">
        <TopicSelector onTopicSelect={handleTopicSelect} />
      </main>

      <footer className="home-footer">
        <p>© 2025 AITutor - Learn anything, anytime, with AI.</p>
      </footer>
    </div>
  );
};

export default HomePage;