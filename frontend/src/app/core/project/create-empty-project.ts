import {
  AI_INSTRUCTIONS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STATUSES,
  SCHEMA_VERSION,
  type TwProject,
} from './project.types';
import { createUuidV4 } from './uuid';

/**
 * Returns a brand-new valid Task Warden project (MVP §3.5).
 * Always embeds the locked aiInstructions and schema version 1.0.0.
 */
export function createEmptyProject(): TwProject {
  return {
    version: SCHEMA_VERSION,
    id: createUuidV4(),
    name: DEFAULT_PROJECT_NAME,
    owner: null,
    startDate: null,
    endDate: null,
    statuses: [...DEFAULT_STATUSES],
    aiInstructions: AI_INSTRUCTIONS,
    tasks: [],
  };
}
