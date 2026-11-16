/**
 * Stagehand Module
 * Exports Stagehand manager and IPC handlers
 */

export { stagehandManager } from './stagehandManager';
export type { StagehandTaskResult, StagehandTaskRequest } from './stagehandManager';
export { setupStagehandHandlers } from './stagehandHandlers';
