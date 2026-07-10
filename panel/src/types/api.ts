export interface NaiveUser {
  username: string;
  password: string;
  nickname: string;
  createdAt: string;
  expiresAt: string | null;
  remainingSec: number;
  expired: boolean;
}

export interface HysteriaUser {
  username: string;
  password: string;
  nickname: string;
  createdAt: string;
  expiresAt: string | null;
  remainingSec: number;
  expired: boolean;
  uuid?: string;
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
  stack: { naive: boolean; hy2: boolean; mieru?: boolean; vless?: boolean };
  domain?: string;
  email?: string;
  serverIp?: string;
  arch?: string;
  port: number;
  mieruPort?: number;
  vlessPort?: number;
  naive: { active: boolean; usersCount: number } | null;
  hy2: { active: boolean; usersCount: number } | null;
  mieru?: { active: boolean; usersCount: number } | null;
  vless?: { active: boolean; usersCount: number } | null;
}

export interface Config {
  domain?: string;
  email?: string;
  serverIp?: string;
  installed: boolean;
  stack: { naive: boolean; hy2: boolean; mieru?: boolean; vless?: boolean };
  panelDomain?: string;
  sshOnly?: boolean;
  port: number;
  mieruPort?: number;
  vlessPort?: number;
  vlessRealityPublicKey?: string;
  [key: string]: unknown;
}

export interface VersionInfo {
  version: string;
  source?: string;
}

export interface TrafficData {
  daily?: unknown;
  connections?: { naive: unknown; hy2: unknown; mieru?: unknown; vless?: unknown };
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

export interface ProtoTraffic {
  rx: number;
  tx: number;
  rxFormatted: string;
  txFormatted: string;
  totalFormatted: string;
}

export interface TrafficResponse {
  perProto?: {
    naive?: ProtoTraffic;
    hy2?: ProtoTraffic;
    mieru?: ProtoTraffic;
    vless?: ProtoTraffic;
  };
  perUser?: {
    naive?: PerUserTraffic;
    hy2?: PerUserTraffic;
    mieru?: PerUserTraffic;
    vless?: PerUserTraffic;
  };
  daily?: unknown;
  connections?: { naive: number | null; hy2: number | null; mieru?: number | null; vless?: number | null };
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

export interface CaddyfileResponse {
  exists: boolean;
  output: string;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  nickname?: string;
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
