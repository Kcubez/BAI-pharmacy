import { setupServer } from "msw/node";

// Shared REST handlers belong here as API clients and hooks gain component tests.
export const server = setupServer();
