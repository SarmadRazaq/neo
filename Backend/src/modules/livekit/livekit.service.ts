import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AccessToken,
  RoomServiceClient,
  RoomConfiguration,
  RoomAgentDispatch,
} from 'livekit-server-sdk';
import { v4 as uuidv4 } from 'uuid';
import { LiveKitConfig } from '../../config/configuration';

export interface LiveKitSessionResponse {
  roomName: string;
  token: string;
  url: string;
}

export interface RoomInfo {
  name: string;
  numParticipants: number;
  creationTime: Date;
}

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private readonly config: LiveKitConfig;
  private readonly roomService: RoomServiceClient | null;

  constructor(private configService: ConfigService) {
    this.config = this.configService.get<LiveKitConfig>('livekit') || {};

    // Initialize room service client if credentials are available
    if (this.config.url && this.config.apiKey && this.config.apiSecret) {
      this.roomService = new RoomServiceClient(
        this.config.url,
        this.config.apiKey,
        this.config.apiSecret,
      );
      this.logger.log('LiveKit RoomServiceClient initialized');
    } else {
      this.roomService = null;
      this.logger.warn(
        'LiveKit credentials not configured - some features will be unavailable',
      );
    }

    if (this.config.agentName) {
      this.logger.log(`Agent dispatch: explicit → '${this.config.agentName}'`);
    } else {
      this.logger.log('Agent dispatch: automatic');
    }
  }

  /**
   * Create a new voice session with a unique room
   * Returns room name, token, and server URL
   */
  async createSession(
    userId?: string,
    participantName?: string,
  ): Promise<LiveKitSessionResponse> {
    if (!this.config.apiKey || !this.config.apiSecret || !this.config.url) {
      throw new Error('LiveKit is not configured');
    }

    // Generate unique room name with UUID
    const roomName = `neo-room-${uuidv4()}`;

    // Generate participant identity (use userId if available, otherwise generate)
    const identity = userId || `user-${uuidv4()}`;
    const name = participantName || 'Neo User';

    // Create access token
    const token = new AccessToken(this.config.apiKey, this.config.apiSecret, {
      identity,
      name,
    });

    // Grant permissions to join the room
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // If agentName is specified, configure explicit agent dispatch
    if (this.config.agentName) {
      token.roomConfig = new RoomConfiguration({
        agents: [
          new RoomAgentDispatch({
            agentName: this.config.agentName,
          }),
        ],
      });
      this.logger.log(
        `Session created: room=${roomName}, identity=${identity}, agent=${this.config.agentName}`,
      );
    } else {
      this.logger.log(
        `Session created: room=${roomName}, identity=${identity} (automatic dispatch)`,
      );
    }

    const jwt = await token.toJwt();

    return {
      roomName,
      token: jwt,
      url: this.config.url,
    };
  }

  /**
   * List all active rooms
   */
  async listRooms(): Promise<RoomInfo[]> {
    if (!this.roomService) {
      throw new Error('LiveKit RoomServiceClient not initialized');
    }

    const rooms = await this.roomService.listRooms();

    return rooms.map((room) => ({
      name: room.name,
      numParticipants: room.numParticipants,
      creationTime: new Date(Number(room.creationTime) * 1000),
    }));
  }

  /**
   * Delete/close a room
   */
  async deleteRoom(roomName: string): Promise<void> {
    if (!this.roomService) {
      throw new Error('LiveKit RoomServiceClient not initialized');
    }

    await this.roomService.deleteRoom(roomName);
    this.logger.log(`Room deleted: ${roomName}`);
  }

  /**
   * Check if LiveKit is configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.apiKey &&
      this.config.apiSecret &&
      this.config.url
    );
  }
}
