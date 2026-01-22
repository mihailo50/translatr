/**
 * Centralized Call Logging Utility
 * Provides clean, structured logging for call lifecycle events
 */

type CallLogLevel =
  | "INIT"
  | "ACCEPT"
  | "DECLINE"
  | "END"
  | "ERROR"
  | "TIMEOUT"
  | "RINGING"
  | "UI_SHOWN"
  | "UI_HIDDEN"
  | "CANCELLED";

interface CallLogData {
  callId?: string;
  roomId: string;
  initiatorId?: string;
  initiatorName?: string;
  receiverId?: string;
  receiverName?: string;
  callType: "audio" | "video";
  duration?: number;
  reason?: string;
  deviceInfo?: string; // e.g. "GlobalCallHandler" or "ChatRoom"
}

class CallLogger {
  private callStartTimes: Map<string, number> = new Map();

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  private log(_level: CallLogLevel, _message: string, _data?: Partial<CallLogData>) {
    // Logging disabled - all console statements removed for production
  }

  callInitiated(data: CallLogData) {
    this.log("INIT", "Call initiated", data);
    if (data.callId) {
      this.callStartTimes.set(data.callId, Date.now());
    }
  }

  callRinging(data: Partial<CallLogData>) {
    this.log("RINGING", "Ringtone playing", data);
  }

  callUIShown(data: Partial<CallLogData>) {
    this.log("UI_SHOWN", "Incoming call UI displayed", data);
  }

  callUIHidden(data: Partial<CallLogData>) {
    this.log("UI_HIDDEN", "Incoming call UI hidden/removed", data);
  }

  callCancelled(data: Partial<CallLogData>) {
    this.log("CANCELLED", "Call cancelled", data);
  }

  callAccepted(data: CallLogData) {
    this.log("ACCEPT", "Call accepted", data);
  }

  callDeclined(data: CallLogData) {
    this.log("DECLINE", "Call declined", data);
    if (data.callId) {
      this.callStartTimes.delete(data.callId);
    }
  }

  callEnded(data: CallLogData) {
    if (data.callId && this.callStartTimes.has(data.callId)) {
      const startTime = this.callStartTimes.get(data.callId);
      if (startTime !== undefined) {
        data.duration = Date.now() - startTime;
        this.callStartTimes.delete(data.callId);
      }
    }
    this.log("END", "Call ended", data);
  }

  callTimeout(data: CallLogData) {
    this.log("TIMEOUT", "Call timed out (no answer)", data);
    if (data.callId) {
      this.callStartTimes.delete(data.callId);
    }
  }

  callError(message: string, data?: Partial<CallLogData>) {
    this.log("ERROR", message, data);
  }
}

export const callLogger = new CallLogger();
