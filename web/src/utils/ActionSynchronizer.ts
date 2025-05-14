import React from 'react';

// Types for synchronized actions
type ActionType = 'write' | 'draw' | 'highlight' | 'erase' | 'newpage';

interface Action {
  type: ActionType;
  content: string;
  timestamp: number; // Timestamp in milliseconds
  executed: boolean;
}

interface SpeechSegment {
  text: string;
  timestamp: number; // Timestamp in milliseconds
  duration?: number;
}

interface ParsedResponse {
  actions: Action[];
  speech: SpeechSegment[];
}

/**
 * Utility to parse AI responses with timestamps and actions,
 * and synchronize them with audio playback
 */
export class ActionSynchronizer {
  private actions: Action[] = [];
  private speech: SpeechSegment[] = [];
  private startTime: number = 0;
  private isPlaying: boolean = false;
  private actionCallback: (action: string) => void;
  private onComplete: () => void;
  private processingAction: boolean = false;
  private lastActionTime: number = 0;
  private actionBuffer: string[] = [];

  constructor(
    actionCallback: (action: string) => void,
    onComplete: () => void
  ) {
    this.actionCallback = actionCallback;
    this.onComplete = onComplete;
  }

  /**
   * Parse a response from the AI with timestamps and actions
   * Example:
   * [00:05] Today we'll learn about {write: "Integration by Substitution"}
   * [00:10] Let's start with an example {draw:rectangle}
   */
  parseResponse(response: string): ParsedResponse {
    const lines = response.split('\n');
    const actions: Action[] = [];
    const speech: SpeechSegment[] = [];
    
    let previousTimestamp = 0;

    lines.forEach((line) => {
      // Extract timestamp (e.g., [00:05])
      const timestampMatch = line.match(/^\[(\d{2}):(\d{2})\]/);
      if (timestampMatch) {
        const minutes = parseInt(timestampMatch[1], 10);
        const seconds = parseInt(timestampMatch[2], 10);
        const timestamp = (minutes * 60 + seconds) * 1000; // Convert to milliseconds
        
        // Extract content after timestamp
        const content = line.substring(timestampMatch[0].length).trim();
        
        // Extract actions from content (e.g., {write: "text"})
        const actionMatches = content.match(/(\{[^}]+\})/g);
        
        if (actionMatches) {
          // Process each action in the line
          actionMatches.forEach((actionText) => {
            // Determine action type
            let type: ActionType = 'write';
            let actionContent = '';
            
            if (actionText.startsWith('{write:')) {
              type = 'write';
              const match = actionText.match(/{write:\s*"([^"]*)"}/);
              if (match) actionContent = match[1];
            } else if (actionText.startsWith('{draw:')) {
              type = 'draw';
              const match = actionText.match(/{draw:([a-z]+)}/);
              if (match) actionContent = match[1];
            } else if (actionText.startsWith('{highlight:')) {
              type = 'highlight';
              const match = actionText.match(/{highlight:\s*"([^"]*)"}/);
              if (match) actionContent = match[1];
            } else if (actionText.startsWith('{erase:')) {
              type = 'erase';
              const match = actionText.match(/{erase:\s*"([^"]*)"}/);
              if (match) actionContent = match[1];
            } else if (actionText.startsWith('{newpage:')) {
              type = 'newpage';
              const match = actionText.match(/{newpage:\s*"([^"]*)"}/);
              if (match) actionContent = match[1];
            }
            
            // Add action to queue with proper timing
            actions.push({
              type,
              content: actionContent,
              timestamp,
              executed: false,
            });
          });
          
          // Add speech without the actions
          const speechText = content.replace(/(\{[^}]+\})/g, '').trim();
          if (speechText) {
            speech.push({
              text: speechText,
              timestamp,
              duration: timestamp - previousTimestamp,
            });
          }
        } else {
          // No actions, just speech
          speech.push({
            text: content,
            timestamp,
            duration: timestamp - previousTimestamp,
          });
        }
        
        previousTimestamp = timestamp;
      } else if (line.trim()) {
        // Lines without timestamps are added as immediate speech
        speech.push({
          text: line.trim(),
          timestamp: previousTimestamp,
        });
      }
    });

    return { actions, speech };
  }

  /**
   * Load a new response to be synchronized
   */
  loadResponse(response: string): void {
    const parsed = this.parseResponse(response);
    this.actions = parsed.actions;
    this.speech = parsed.speech;
    this.actionBuffer = [];
    this.processingAction = false;
  }

  /**
   * Start the synchronized playback
   */
  start(): void {
    this.startTime = Date.now();
    this.isPlaying = true;
    this.lastActionTime = 0;
    this.checkActions();
  }

  /**
   * Stop the synchronized playback
   */
  stop(): void {
    this.isPlaying = false;
    this.processingAction = false;
    this.actionBuffer = [];
  }

  /**
   * Reset the synchronizer
   */
  reset(): void {
    this.actions = [];
    this.speech = [];
    this.isPlaying = false;
    this.processingAction = false;
    this.actionBuffer = [];
  }

  /**
   * Notify that an action has been completed
   * This allows the next action to be processed
   */
  notifyActionComplete(): void {
    this.processingAction = false;
    
    // If we have buffered actions, process the next one
    if (this.actionBuffer.length > 0) {
      const nextAction = this.actionBuffer.shift();
      if (nextAction) {
        this.actionCallback(nextAction);
        this.processingAction = true;
      }
    } else {
      // Check for new actions
      this.checkActions();
    }
  }

  /**
   * Check for actions to be executed based on elapsed time
   */
  private checkActions(): void {
    if (!this.isPlaying) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - this.startTime;

    // Execute any actions that should have occurred by now
    let actionFound = false;
    
    // If we're already processing an action, don't start a new one
    if (this.processingAction) {
      setTimeout(() => this.checkActions(), 100);
      return;
    }
    
    for (const action of this.actions) {
      if (!action.executed && action.timestamp <= elapsedTime) {
        // Format action for the whiteboard component
        let actionText = '';
        
        switch (action.type) {
          case 'write':
            actionText = `{write: "${action.content}"}`;
            break;
          case 'draw':
            actionText = `{draw:${action.content}}`;
            break;
          case 'highlight':
            actionText = `{highlight: "${action.content}"}`;
            break;
          case 'erase':
            actionText = `{erase: "${action.content}"}`;
            break;
          case 'newpage':
            actionText = `{newpage: "${action.content}"}`;
            break;
        }
        
        // Buffer the action if we're already processing one
        // or if it's too soon after the last action
        const timeSinceLastAction = elapsedTime - this.lastActionTime;
        if (this.processingAction || (this.lastActionTime > 0 && timeSinceLastAction < 500)) {
          this.actionBuffer.push(actionText);
        } else {
          // Trigger the action
          this.actionCallback(actionText);
          this.processingAction = true;
          this.lastActionTime = elapsedTime;
        }
        
        action.executed = true;
        actionFound = true;
        
        // Only execute one action at a time
        break;
      }
    }

    // Check if all actions have been executed
    const allActionsExecuted = this.actions.every(action => action.executed);
    const allActionsProcessed = allActionsExecuted && this.actionBuffer.length === 0 && !this.processingAction;
    
    if (allActionsProcessed && this.actions.length > 0) {
      this.isPlaying = false;
      this.onComplete();
    } else if (this.isPlaying) {
      // Schedule next check
      setTimeout(() => this.checkActions(), actionFound ? 200 : 100);
    }
  }

  /**
   * Get the current speech segment based on elapsed time
   */
  getCurrentSpeechSegment(): SpeechSegment | null {
    if (!this.isPlaying || this.speech.length === 0) return null;

    const elapsedTime = Date.now() - this.startTime;
    
    // Find the current speech segment
    for (let i = this.speech.length - 1; i >= 0; i--) {
      if (this.speech[i].timestamp <= elapsedTime) {
        return this.speech[i];
      }
    }
    
    return null;
  }

  /**
   * Get all remaining actions
   */
  getRemainingActions(): Action[] {
    return this.actions.filter(action => !action.executed);
  }
}

export default ActionSynchronizer;