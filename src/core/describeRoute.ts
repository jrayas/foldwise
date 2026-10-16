// Turns a routing result into two plain-English lines for the Test section. Pure.
import type { RouteResult } from './route';

export interface RouteDescription {
  headline: string;
  detail: string;
}

export function describeRoute(result: RouteResult): RouteDescription {
  switch (result.status) {
    case 'ok':
      return { headline: `Saves to ${result.path}`, detail: [result.reason, ...result.warnings].join(' ') };
    case 'needs-decision':
      return {
        headline: `Would ask: ${result.conflictWith} already exists`,
        detail: [`Suggested name: ${result.suggestedPath}.`, result.reason, ...result.warnings].join(' '),
      };
    case 'cancelled':
      return { headline: 'Would cancel the paste', detail: result.reason };
    case 'passthrough':
      return { headline: "Left to Obsidian's attachment setting", detail: result.reason };
  }
}
