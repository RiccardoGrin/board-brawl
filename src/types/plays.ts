/**
 * Plays History Types
 *
 * Filter and sort definitions for the Plays history page.
 */

/** Filter options for plays history list */
export interface PlaysFilters {
  /** Search by game name */
  search?: string;
  /** Only show tournament sessions */
  tournamentOnly?: boolean;
  /** Only show casual plays (no tournamentId) */
  casualOnly?: boolean;
  /** Only show games user won */
  winsOnly?: boolean;
}

/** Available sort fields for plays list */
export type PlaysSortField = 'playedAt' | 'gameName';

/** Sort configuration for plays list */
export interface PlaysSort {
  field: PlaysSortField;
  direction: 'asc' | 'desc';
}
