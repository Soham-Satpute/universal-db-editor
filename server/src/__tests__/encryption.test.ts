import { describe, it, expect, beforeAll } from "vitest";

// encryption.ts reads process.env.ENCRYPTION_KEY lazily (inside each
// call), so it's enough to set it before importing/using the module.
beforeAll(() => {
  process.env.ENCRYPTION_KEY =
    "test_encryption_key_only_used_in_vitest_suite_not_real_secret";
});

import { encrypt, decrypt } from "../utils/encryption";

describe("encryption (AES-256-GCM)", () => {
  it("round-trips a plain string", () => {
    const plaintext = "hunter2";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("round-trips a JSON-serialized connection config", () => {
    const config = {
      type: "postgresql",
      host: "localhost",
      port: 5432,
      database: "mydb",
      user: "admin",
      password: "s3cr3t!",
    };
    const encrypted = encrypt(JSON.stringify(config));
    const decrypted = JSON.parse(decrypt(encrypted));
    expect(decrypted).toEqual(config);
  });

  it("produces a different ciphertext each time (random IV)", () => {
    const a = encrypt("same input");
    const b = encrypt("same input");
    expect(a).not.toBe(b);
  });

  it("returns ciphertext in iv:authTag:ciphertext hex format", () => {
    const encrypted = encrypt("format check");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
    parts.forEach((part) => expect(part).toMatch(/^[0-9a-f]+$/));
  });

  it("throws when decrypting tampered ciphertext", () => {
    const encrypted = encrypt("don't tamper with me");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    // Flip a hex character in the ciphertext portion
    const tamperedHex = ciphertext.slice(0, -1) + (ciphertext.slice(-1) === "0" ? "1" : "0");
    const tampered = [iv, authTag, tamperedHex].join(":");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws on malformed input (wrong number of segments)", () => {
    expect(() => decrypt("not-a-valid-encrypted-string")).toThrow(
      /Invalid encrypted text format/,
    );
  });
});
