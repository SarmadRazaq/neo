variable "aws_region" {
  description = "AWS Region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project identifier used for naming resources"
  type        = string
  default     = "neo"
}

variable "environment" {
  description = "Deployment environment (e.g., dev, production)"
  type        = string
  default     = "production"
}

variable "db_password" {
  description = "Master password for the RDS database"
  type        = string
  sensitive   = true
}

variable "livekit_api_key" {
  description = "API Key for LiveKit Server"
  type        = string
  sensitive   = true
}

variable "livekit_secret_key" {
  description = "Secret Key for LiveKit Server"
  type        = string
  sensitive   = true
}

variable "allowed_public_ips" {
  description = "List of IPv4 addresses (CIDR format) allowed to access EC2, ECS, and DB services publicly"
  type        = list(string)
  default     = []
}

variable "allowed_public_ipv6s" {
  description = "List of IPv6 addresses (CIDR format) allowed to access EC2, ECS, and DB services publicly"
  type        = list(string)
  default     = []
}

variable "gotrue_jwt_secret" {
  description = "JWT secret for Supabase GoTrue (generate with: openssl rand -base64 32)"
  type        = string
  sensitive   = true
}

variable "supabase_anon_key" {
  description = "Supabase anonymous key (generate with Supabase CLI or use JWT with anon role)"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key" {
  description = "Supabase service role key (generate with Supabase CLI or use JWT with service_role)"
  type        = string
  sensitive   = true
}

variable "dashboard_username" {
  description = "Username for Supabase Studio dashboard HTTP basic auth"
  type        = string
  default     = "admin"
}

variable "dashboard_password" {
  description = "Password for Supabase Studio dashboard HTTP basic auth (must include at least one letter)"
  type        = string
  sensitive   = true
}

# Google OAuth for Supabase Auth
variable "google_oauth_client_id" {
  description = "Google OAuth Client ID (from Google Cloud Console)"
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Google OAuth Client Secret (from Google Cloud Console)"
  type        = string
  sensitive   = true
  default     = ""
}

# Doppler for AI Backend secrets management
variable "doppler_token" {
  description = "Doppler service token for ECS containers (generate from Doppler dashboard for neo/prd config)"
  type        = string
  sensitive   = true
}

# Developer IAM Users
variable "developer_usernames" {
  description = "List of IAM usernames for developers with read-only access"
  type        = list(string)
  default     = []
}
