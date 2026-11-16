export interface AppConfig {
  nodeEnv: string;
  port: number;
  apiPrefix: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  url: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret?: string;
}

export interface AwsConfig {
  region: string;
  ecsCluster?: string;
}

export interface LiveKitConfig {
  apiKey?: string;
  apiSecret?: string;
  url?: string;
  agentName?: string;
}

export interface Configuration {
  app: AppConfig;
  database: DatabaseConfig;
  supabase: SupabaseConfig;
  aws: AwsConfig;
  livekit: LiveKitConfig;
  corsOrigins: string[];
}

export default (): Configuration => {
  const dbHost = process.env.DATABASE_HOST || 'localhost';
  const dbPort = parseInt(process.env.DATABASE_PORT || '5432', 10);
  const dbName = process.env.DATABASE_NAME || 'neodb';
  const dbUser = process.env.DATABASE_USER || 'postgres';
  const dbPassword = process.env.DATABASE_PASSWORD || '';

  // Use DATABASE_URL or build from parts
  let databaseUrl =
    process.env.DATABASE_URL ||
    `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}?schema=public`;
  
  // Convert psql:// to postgresql:// (some providers use psql://)
  if (databaseUrl.startsWith('psql://')) {
    databaseUrl = databaseUrl.replace('psql://', 'postgresql://');
    console.log('Converted psql:// to postgresql://');
  }
  
  // Log which URL source is being used (for debugging, don't log the actual URL)
  if (process.env.DATABASE_URL) {
    console.log('Using DATABASE_URL from environment');
  } else {
    console.log('Building database URL from individual parts');
  }

  return {
    app: {
      nodeEnv: process.env.NODE_ENV || 'development',
      port: parseInt(process.env.PORT || '3000', 10),
      apiPrefix: '/api/v1',
    },
    database: {
      host: dbHost,
      port: dbPort,
      name: dbName,
      user: dbUser,
      password: dbPassword,
      url: databaseUrl,
    },
    supabase: {
      url: process.env.SUPABASE_URL || 'http://localhost:8000',
      anonKey: process.env.SUPABASE_ANON_KEY || '',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      jwtSecret: process.env.SUPABASE_JWT_SECRET,
    },
    aws: {
      region: process.env.AWS_REGION || 'us-east-1',
      ecsCluster: process.env.ECS_CLUSTER,
    },
    livekit: {
      apiKey: process.env.LIVEKIT_API_KEY,
      apiSecret: process.env.LIVEKIT_API_SECRET,
      url: process.env.LIVEKIT_URL,
      agentName: process.env.AGENT_NAME,
    },
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map((origin) => origin.trim()),
  };
};
