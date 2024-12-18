import { request } from "node:https";
import { brotliDecompress, gzipSync } from "node:zlib";

import type { IncomingMessage } from "node:http";

interface FetchLite {
  body?: object;
  method?: "get" | "post";
  acceptSimplified?: boolean;
  url: string;
}

type OptionalPromise<T> = Promise<T> | T;

// This function allows to call a "lazy" callback.
// The first execution can be delayed when the "wait" parameter is different from zero, otherwise it will be immediate.
// The next execution can be delayed as long as "delay" is non - zero, with a minimum time of zero ms.
// Furthermore, if several executions happen at the same time, only the last one will be actually be executed.
export function lazyCallback<T, A>(
  callback: (...args: A[]) => Promise<T> | T,
  wait = 0,
  delay = 0,
): (...args: A[]) => Promise<void> {
  // Defines whether there is a process currently running.
  let isRunning = false;

  // It only stores the arguments for the next run, since the callback will be the same.
  // It is important to remember that the arguments will be discarded if a new execution is requested,
  // so we always prioritize the last execution and discard anything before it, with the exception of the current process.
  let argumentsNext: A[] | undefined = undefined;

  // Here's the magic: a "activator" is returned, instead of the original callback.
  // It manages when the current execution ends and when the next one starts, if it exists.
  async function activate(...args: A[]): Promise<void> {
    if (isRunning) {
      // If there is already a process running, we only store the arguments for the next run.
      argumentsNext = args;
    } else {
      // If no callback is running right now, then run the current one immediately.
      isRunning = true;

      if (wait === 0) {
        await Promise.resolve(callback(...args));
      } else {
        await new Promise((resolve) => {
          setTimeout(() => {
            // Must execute the callback with the most recent arguments, if any.
            if (argumentsNext) {
              const argumentsNextCopied = argumentsNext;

              argumentsNext = undefined;

              void Promise.resolve(callback(...argumentsNextCopied)).then(
                resolve,
              );
            } else {
              void Promise.resolve(callback(...args)).then(resolve);
            }
          }, wait);
        });
      }

      // If afterwards there is already some callback waiting to be executed, it starts it after the delay.
      // Note that this will only happen after the full completion of the previous process.
      setTimeout(() => {
        // After the execution ends, it releases for another process to run.
        isRunning = false;

        if (argumentsNext !== undefined) {
          void activate(...argumentsNext);

          argumentsNext = undefined;
        }
      }, delay);
    }
  }

  return activate;
}

// This function checks if a promise can be processed as long as the conditional callback returns true.
// @see https://stackoverflow.com/a/64947598/755393
export async function waitUntil(
  condition: () => Promise<boolean> | boolean,
  retryDelay = 0,
): Promise<void> {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      void Promise.resolve(condition()).then((result) => {
        if (result) {
          clearInterval(interval);
          resolve();
        }
      });
    }, retryDelay);
  });
}

// This function lets you control how many promises can be worked on concurrently.
// As soon as one promise ends, another one can be processed.
// If the concurrency number is zero then they will be processed immediately.
export function promiseLimit(
  concurrency: number,
): <T>(fn: () => T) => OptionalPromise<T> {
  // If concurrency is zero, all promises are executed immediately.
  if (concurrency === 0) {
    return <T>(fn: () => T): T => fn();
  }

  let inProgress = 0;

  return async <T>(callback: () => Promise<T> | T): Promise<T> => {
    // Otherwise, it will be necessary to wait until there is a "vacancy" in the concurrency process for the promise to be executed.
    await waitUntil(() => inProgress < concurrency);

    // As soon as this "vacancy" is made available, the function is executed.
    // Note that the execution of the function "takes a seat" during the process.
    inProgress++;

    const functionResult = await callback();

    inProgress--;

    return functionResult;
  };
}

// During testing, this function is mocked to return false in some cases.
export function cacheEnabled(): boolean {
  return true;
}

// A simple post request.
// Based on https://github.com/vasanthv/fetch-lite/blob/master/index.js
export async function fetchLite<T>(options: FetchLite) {
  return new Promise<T | undefined>((resolve) => {
    try {
      const url = new URL(options.url);

      const thisRequest = request(
        url.href,
        { method: options.method ?? "get" },
        (response: IncomingMessage) => {
          const responseBuffers: Buffer[] = [];

          response.on("data", (data: Buffer) => responseBuffers.push(data));

          response.on("error", () => {
            resolve(undefined);
          });

          response.on("end", () => {
            const responseBuffer = Buffer.concat(responseBuffers);

            if (response.headers["content-encoding"] === undefined) {
              resolve(JSON.parse(responseBuffer.toString()) as T);

              return;
            }

            brotliDecompress(responseBuffer, (_error, contents) => {
              resolve(JSON.parse(contents.toString()) as T);
            });
          });
        },
      );

      thisRequest.setHeader("Content-Type", "application/json");
      thisRequest.setHeader("Content-Encoding", "gzip");
      thisRequest.setHeader("Accept-Encoding", "br");

      if (options.acceptSimplified === true) {
        thisRequest.setHeader("Accept", "application/vnd.npm.install-v1+json");
      }

      if (options.body !== undefined) {
        const bodyStringify = gzipSync(JSON.stringify(options.body));

        thisRequest.setHeader("Content-Length", bodyStringify.length);
        thisRequest.write(bodyStringify);
      }

      thisRequest.on("error", () => {
        resolve(undefined);
      });

      thisRequest.end();
    } catch {
      resolve(undefined);
    }
  });
}
