export interface PackageManifest {
  name: string;
  version: string;
  publishConfig: { registry: string; access?: string };
  bin?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  [key: string]: unknown;
}
export interface SizeMetrics {
  size: number;
  unpackedSize: number;
  executableBytes: number;
}
export interface PackageReport extends SizeMetrics {
  registry: string;
  name: string;
  version: string;
  filename: string;
  integrity: string;
  manifest: PackageManifest;
}
export interface ReleaseBundle {
  schema: number;
  sha: string;
  version: string;
  tag: string;
  packages: PackageReport[];
  release?: boolean;
  notes?: string;
}
export type SizeBudgets = Record<string, SizeMetrics>;
export interface Publishable {
  name: string;
  version?: string;
  integrity?: string;
  manifest: { bin?: Record<string, string> };
}
export interface PublishIO<T> {
  existing: (
    report: T,
  ) => string | null | undefined | Promise<string | null | undefined>;
  publish: (report: T) => unknown;
  sleep?: (milliseconds: number) => unknown;
}
