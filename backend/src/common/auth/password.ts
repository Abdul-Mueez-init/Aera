import {
  randomBytes,
  scrypt as callbackScrypt,
  timingSafeEqual,
} from "node:crypto";
const keyLength = 64;
const cost = 16384;
const blockSize = 8;
const parallelization = 1;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  params: ScryptParams = { N: cost, r: blockSize, p: parallelization },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    callbackScrypt(
      password,
      salt,
      length,
      {
        ...params,
        // Node's default maxmem (32 MiB) rejects N >= 32768 outright;
        // size the limit to the parameters actually being derived with.
        maxmem: 128 * params.N * params.r * params.p + 64 * 1024 * 1024,
      },
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

/**
 * Parse the scrypt parameters stored in an encoded hash. They are part
 * of the hash format precisely so the cost can be raised later; the old
 * verifier ignored them and always derived with today's constants,
 * which would have silently broken every hash minted after such a
 * raise. Bounds keep a corrupt/hostile stored value from turning
 * verification into a memory/CPU denial of service.
 */
function parseStoredParams(
  encodedCost: string,
  encodedBlockSize: string,
  encodedParallelization: string,
): ScryptParams | null {
  const N = Number(encodedCost);
  const r = Number(encodedBlockSize);
  const p = Number(encodedParallelization);
  if (
    !Number.isInteger(N) ||
    N <= 1 ||
    N > 2 ** 18 ||
    (N & (N - 1)) !== 0 ||
    !Number.isInteger(r) ||
    r <= 0 ||
    r > 32 ||
    !Number.isInteger(p) ||
    p <= 0 ||
    p > 16
  ) {
    return null;
  }
  return { N, r, p };
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

  const params = parseStoredParams(
    encodedCost,
    encodedBlockSize,
    encodedParallelization,
  );
  if (!params) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, "base64url");
  const expectedKey = Buffer.from(encodedKey, "base64url");
  if (salt.length === 0 || expectedKey.length === 0) {
    return false;
  }

  let derivedKey: Buffer;
  try {
    derivedKey = await deriveKey(password, salt, expectedKey.length, params);
  } catch {
    // A malformed stored hash must read as "no match", never as a 500.
    return false;
  }

  return (
    derivedKey.length === expectedKey.length &&
    timingSafeEqual(derivedKey, expectedKey)
  );
}
