/**
 * Centralized Call Logging Utility
 * Provides clean, structured logging for call lifecycle events
 */

type CallLogLevel = 'INIT' | 'ACCEPT' | 'DECLINE' | 'END' | 'ERROR' | 'TIMEOUT';

interface CallLogData {
  callId?: string;
  roomId: string;
  initiatorId: string;
  initiatorName: string;
  receiverId?: string;
  receiverName?: string;
  callType: 'audio' | 'video';
  duration?: number;
  reason?: string;
}

class CallLogger {
  private callStartTimes: Map<string, number> = new Map();
  
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private log(level: CallLogLevel, message: string, data?: Partial<CallLogData>) {
    const timestamp = new Date().toLocaleTimeString();
    const icon = {
      INIT: '📞',
      ACCEPT: '✅',
      DECLINE: '❌',
      END: '📴',
      ERROR: '🔴',
      TIMEOUT: '⏱️'
    }[level];

    let logMessage = `${icon} [CALL ${level}] ${timestamp} - ${message}`;
    
    if (data) {
      const details: string[] = [];
      if (data.callId) details.push(`ID: ${data.callId.substring(0, 12)}...`);
      if (data.roomId) details.push(`Room: ${data.roomId.substring(0, 12)}...`);
      if (data.initiatorName) details.push(`Initiator: ${data.initiatorName}`);
      if (data.receiverName) details.push(`Receiver: ${data.receiverName}`);
      if (data.callType) details.push(`Type: ${data.callType.toUpperCase()}`);
      if (data.duration !== undefined) details.push(`Duration: ${this.formatDuration(data.duration)}`);
      if (data.reason) details.push(`Reason: ${data.reason}`);
      
      if (details.length > 0) {
        logMessage += ` | ${details.join(' | ')}`;
      }
    }

    console.log(logMessage);
  }

  callInitiated(data: CallLogData) {
    this.log('INIT', 'Call initiated', data);
    if (data.callId) {
      this.callStartTimes.set(data.callId, Date.now());
    }
  }

  callAccepted(data: CallLogData) {
    this.log('ACCEPT', 'Call accepted', data);
  }

  callDeclined(data: CallLogData) {
    this.log('DECLINE', 'Call declined', data);
    if (data.callId) {
      this.callStartTimes.delete(data.callId);
    }
  }

  callEnded(data: CallLogData) {
    if (data.callId && this.callStartTimes.has(data.callId)) {
      const startTime = this.callStartTimes.get(data.callId)!;
      data.duration = Date.now() - startTime;
      this.callStartTimes.delete(data.callId);
    }
    this.log('END', 'Call ended', data);
  }

  callTimeout(data: CallLogData) {
    this.log('TIMEOUT', 'Call timed out (no answer)', data);
    if (data.callId) {
      this.callStartTimes.delete(data.callId);
    }
  }

  callError(message: string, data?: Partial<CallLogData>) {
    this.log('ERROR', message, data);
  }
}

export const callLogger = new CallLogger();
