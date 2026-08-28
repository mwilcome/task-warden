import {
  AI_INSTRUCTIONS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STATUSES,
  SCHEMA_VERSION,
  type TwProject,
} from './project.types';
import { createProjectId } from './ids';

/**
 * Returns a brand-new valid Task Warden project.
 * Always embeds the locked aiInstructions and schema version 1.0.0.
 */
export function createEmptyProject(): TwProject {
  return {
    version: SCHEMA_VERSION,
    id: createProjectId(),
    name: DEFAULT_PROJECT_NAME,
    statuses: [...DEFAULT_STATUSES],
    aiInstructions: AI_INSTRUCTIONS,
    tasks: [],
  };
}
