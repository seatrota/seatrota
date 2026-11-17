// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import type { CSSProperties } from "react";

export const pageStyle: CSSProperties = {
  maxWidth: 720,
  margin: "0 auto",
  padding: 24,
  display: "grid",
  gap: 16,
};

export const rowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

export const inputStyle: CSSProperties = {
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  padding: "8px 10px",
  minWidth: 180,
};

export const cardStyle: CSSProperties = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 16,
  display: "grid",
  gap: 8,
};
