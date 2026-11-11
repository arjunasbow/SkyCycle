interface BuildInfo { label: string; commit: string; revisionCount: number | null; builtAt: string; }
declare const __SKYCYCLE_BUILD_INFO__: BuildInfo;
export const BUILD_INFO: BuildInfo = __SKYCYCLE_BUILD_INFO__;
