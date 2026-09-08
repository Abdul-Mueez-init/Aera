import {
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
} from "node:crypto";
const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    callbackScrypt(
      password,
      salt,
      length,
      { N: cost, r: blockSize, p: parallelization },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey as Buffer);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt, keyLength);

  return [
    "scrypt",
    cost,
    blockSize,
    parallelization,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [
    algorithm,
    encodedCost,
    encodedBlockSize,
    encodedParallelization,
    encodedSalt,
    encodedKey,
  ] = encodedHash.split("$");

  if (
    algorithm !== "scrypt" ||
    !encodedCost ||
    !encodedBlockSize ||
    !encodedParallelization ||
    !encodedSalt ||
    !encodedKey
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  const derivedKey = await deriveKey(password, salt, expectedKey.length);

  return (
    derivedKey.length === expectedKey.length &&
    timingSafeEqual(derivedKey, expectedKey)
  );
}
