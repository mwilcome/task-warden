import {
  AI_INSTRUCTIONS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_STATUSES,
  SCHEMA_VERSION,
  type TwProject,
} from './project.types';
import { createUuidV4 } from './uuid';

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
