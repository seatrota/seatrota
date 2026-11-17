// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 SeatRota contributors

import process from "node:process";
import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";

function encryptionKey(): string {
  const key = process.env.CALENDSO_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("CALENDSO_ENCRYPTION_KEY is not set");
  }
  return key;
}

export function encryptClientSecret(secret: string): string {
  return symmetricEncrypt(secret, encryptionKey());
}

export function decryptClientSecret(ciphertext: string): string {
  return symmetricDecrypt(ciphertext, encryptionKey());
}
