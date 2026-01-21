/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as notion from "../notion.js";
import type * as scheduler from "../scheduler.js";
import type * as setupSessions from "../setupSessions.js";
import type * as slackInstallations from "../slackInstallations.js";
import type * as slackOauthStates from "../slackOauthStates.js";
import type * as timers from "../timers.js";
import type * as userConfig from "../userConfig.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  notion: typeof notion;
  scheduler: typeof scheduler;
  setupSessions: typeof setupSessions;
  slackInstallations: typeof slackInstallations;
  slackOauthStates: typeof slackOauthStates;
  timers: typeof timers;
  userConfig: typeof userConfig;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
