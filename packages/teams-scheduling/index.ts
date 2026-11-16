// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

export interface SharedWindow {
  readonly rosterId: string;
  readonly startMinute: number;
  readonly endMinute: number;
}

export function sharedWindowLength(window: SharedWindow): number {
  if (window.endMinute < window.startMinute) {
    return 0;
  }
  return window.endMinute - window.startMinute;
}
