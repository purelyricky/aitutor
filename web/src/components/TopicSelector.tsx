import React, { useState } from 'react';
import './TopicSelector.css';

// Define topic categories and subjects
const topics = [
  {
    category: 'Mathematics',
    subjects: [
      { id: 'calculus-derivatives', name: 'Calculus: Derivatives' },
      { id: 'calculus-integration', name: 'Calculus: Integration by Substitution' },
      { id: 'linear-algebra', name: 'Linear Algebra: Matrices' },
      { id: 'probability', name: 'Probability and Statistics' },
    ]
  },
  {
    category: 'Physics',
    subjects: [
      { id: 'physics-mechanics', name: 'Classical Mechanics' },
      { id: 'physics-electricity', name: 'Electricity and Magnetism' },
      { id: 'physics-waves', name: 'Waves and Optics' },
      { id: 'physics-quantum', name: 'Quantum Physics' },
    ]
  },
  {
    category: 'Computer Science',
    subjects: [
      { id: 'cs-algorithms', name: 'Algorithms and Data Structures' },
      { id: 'cs-database', name: 'Database Design' },
      { id: 'cs-web', name: 'Web Development' },
      { id: 'cs-ai', name: 'Artificial Intelligence' },
    ]
  }
];

interface TopicSelectorProps {
  onTopicSelect: (topicId: string, topicName: string) => void;
}

const TopicSelector: React.FC<TopicSelectorProps> = ({ onTopicSelect }) => {
  const [customTopic, setCustomTopic] = useState('');
  const [activeCategory, setActiveCategory] = useState(topics[0].category);

  const handleCustomTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customTopic.trim()) {
      onTopicSelect(`custom-${Date.now()}`, customTopic);
    }
  };

  return (
    <div className="topic-selector">
      <h2>Select a topic to learn</h2>
      
      <div className="topic-categories">
        {topics.map(topic => (
          <button
            key={topic.category}
            className={`category-btn ${activeCategory === topic.category ? 'active' : ''}`}
            onClick={() => setActiveCategory(topic.category)}
          >
            {topic.category}
          </button>
        ))}
      </div>
      
      <div className="topic-subjects">
        {topics.find(t => t.category === activeCategory)?.subjects.map(subject => (
          <div 
            key={subject.id} 
            className="subject-card"
            onClick={() => onTopicSelect(subject.id, subject.name)}
          >
            <h3>{subject.name}</h3>
            <button className="start-btn">Start Learning</button>
          </div>
        ))}
      </div>
      
      <div className="custom-topic">
        <h3>Or enter your own topic</h3>
        <form onSubmit={handleCustomTopicSubmit}>
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="e.g., Newton's Laws of Motion"
          />
          <button type="submit" disabled={!customTopic.trim()}>
            Start Custom Lesson
          </button>
        </form>
      </div>
    </div>
  );
};

export default TopicSelector;