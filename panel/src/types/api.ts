export interface NaiveUser {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

export interface HysteriaUser {
  username: string;
  password: string;
  expiry: string | null;
  expired: boolean;
  created: string;
}

export interface SystemStatus {
  caddy: 'active' | 'inactive' | 'unknown';
  hysteria: 'active' | 'inactive' | 'unknown';
  panelUptime: string;
  serverIp: string;
  domain: string;
}

export interface Config {
  panelDomain: string;
  proxyDomain: string;
  adminEmail: string;
  naiveEnabled: boolean;
  hysteriaEnabled: boolean;
  masqueradeMode: string;
  masqueradeUrl: string;
  sshOnly: boolean;
}

export interface VersionInfo {
  version: string;
  targetVersion: string | null;
}

export interface TrafficData {
  caddy?: {
    bytesIn: number;
    bytesOut: number;
    connections: number;
  };
  hysteria?: {
    packetsIn: number;
    packetsOut: number;
    connections: number;
  };
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
  };
}

export interface LogEntry {
  timestamp: string;
  line: string;
}

export interface BypassStatus {
  enabled: boolean;
  entries: number;
  file: string;
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
  expiry: string | null;
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
  directAll: boolean;
  updatedAt: string;
  bypassCidrs?: string[];
  geoSetsExist?: boolean;
}

export interface AclUpdateInput {
  enabled?: boolean;
  blockDomains?: string[];
  blockGeosite?: string[];
  blockGeoip?: string[];
  directAll?: boolean;
}

export interface GeoSiteCategory {
  categories: string[];
}

export interface GeoIpCountry {
  countries: string[];
}
