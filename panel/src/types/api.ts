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
