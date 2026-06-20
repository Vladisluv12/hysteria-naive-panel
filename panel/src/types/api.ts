export interface NaiveUser {
  username: string;
  password: string;
  createdAt: string;
  expiresAt: string | null;
  remainingSec: number;
  expired: boolean;
}

export interface HysteriaUser {
  username: string;
  password: string;
  createdAt: string;
  expiresAt: string | null;
  remainingSec: number;
  expired: boolean;
}

export interface NaiveUserListResponse {
  users: NaiveUser[];
}

export interface HysteriaUserListResponse {
  users: HysteriaUser[];
}

export interface CreateUserResponse {
  success: boolean;
  link?: string;
  message?: string;
}

export interface UpdateUserResponse {
  success: boolean;
  expiresAt?: string;
  message?: string;
}

export interface DeleteUserResponse {
  success: boolean;
  message?: string;
}

export interface SystemStatus {
  installed: boolean;
  stack: { naive: boolean; hy2: boolean };
  domain?: string;
  email?: string;
  serverIp?: string;
  arch?: string;
  port: number;
  naive: { active: boolean; usersCount: number } | null;
  hy2: { active: boolean; usersCount: number } | null;
}

export interface Config {
  domain?: string;
  email?: string;
  serverIp?: string;
  installed: boolean;
  stack: { naive: boolean; hy2: boolean };
  panelDomain?: string;
  sshOnly?: boolean;
  port: number;
  [key: string]: unknown;
}

export interface VersionInfo {
  version: string;
  source?: string;
}

export interface TrafficData {
  daily?: unknown;
  connections?: { naive: unknown; hy2: unknown };
  hourly?: unknown[];
  lastReset?: unknown;
  error?: string;
}

export interface UserTraffic {
  rx: number;
  tx: number;
  conns: number;
  rxFormatted: string;
  txFormatted: string;
  totalFormatted: string;
}

export interface PerUserTraffic {
  users: Record<string, UserTraffic>;
  updated_at: number;
}

export interface TrafficResponse {
  perUser?: {
    naive?: PerUserTraffic;
    hy2?: PerUserTraffic;
  } & { [key: string]: PerUserTraffic | undefined };
  daily?: unknown;
  connections?: unknown;
  hourly?: unknown[];
  lastReset?: unknown;
  error?: string;
}

export interface LogsResponse {
  unit: string;
  output: string;
}

export interface PortsResponse {
  output: string;
}

export interface HysteriaConfigResponse {
  exists: boolean;
  output: string;
}

export interface TuningStatus {
  bbr: boolean;
  udpBuffers: boolean;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  expireDays?: number;
  expiry?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface AclConfig {
  enabled: boolean;
  blockDomains: string[];
  blockGeosite: string[];
  blockGeoip: string[];
  blockPrivateIPs: boolean;
  directCidrs: string[];
  directAll: boolean;
  updatedAt: string;
  geoSetsExist?: boolean;
}

export interface AclUpdateInput {
  enabled?: boolean;
  blockDomains?: string[];
  blockGeosite?: string[];
  blockGeoip?: string[];
  blockPrivateIPs?: boolean;
  directCidrs?: string[];
  directAll?: boolean;
}

export interface GeoSiteCategory {
  categories: string[];
}

export interface GeoIpCountry {
  countries: string[];
}
