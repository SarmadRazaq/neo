import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { LiveKitService, LiveKitSessionResponse, RoomInfo } from './livekit.service';

interface CreateSessionDto {
  userId?: string;
  participantName?: string;
}

@Controller('livekit')
export class LiveKitController {
  constructor(private readonly livekitService: LiveKitService) {}

  /**
   * Create a new voice session
   * Returns room name, token, and server URL
   */
  @Post('session')
  async createSession(
    @Body() body: CreateSessionDto,
  ): Promise<LiveKitSessionResponse> {
    try {
      return await this.livekitService.createSession(
        body.userId,
        body.participantName,
      );
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to create session',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * List all active rooms (admin/debug endpoint)
   */
  @Get('rooms')
  async listRooms(): Promise<RoomInfo[]> {
    try {
      return await this.livekitService.listRooms();
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to list rooms',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a room (admin/debug endpoint)
   */
  @Delete('rooms/:roomName')
  async deleteRoom(@Param('roomName') roomName: string): Promise<{ success: boolean }> {
    try {
      await this.livekitService.deleteRoom(roomName);
      return { success: true };
    } catch (error) {
      throw new HttpException(
        error instanceof Error ? error.message : 'Failed to delete room',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Health check for LiveKit configuration
   */
  @Get('health')
  async health(): Promise<{ configured: boolean; agentName?: string }> {
    const config = this.livekitService.isConfigured();
    return {
      configured: config,
    };
  }
}
