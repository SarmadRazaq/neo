output "ecr_repo_nestjs" {
  description = "URL of the ECR repository for NestJS"
  value       = aws_ecr_repository.nestjs.repository_url
}

output "ecr_repo_ai" {
  description = "URL of the ECR repository for AI Backend"
  value       = aws_ecr_repository.ai_backend.repository_url
}

output "db_endpoint" {
  description = "RDS connection endpoint"
  value       = aws_db_instance.postgres.address
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "supertokens_url" {
  description = "URL to access Supabase Auth (GoTrue) via ALB (base path: /auth/v1)"
  value       = "http://${aws_lb.main.dns_name}/auth/v1"
}

output "supabase_auth_url" {
  description = "URL to access Supabase Auth (GoTrue) via ALB (base path: /auth/v1)"
  value       = "http://${aws_lb.main.dns_name}/auth/v1"
}

output "livekit_url" {
  description = "URL to access LiveKit via ALB (WebRTC signaling: /rtc, API: /twirp)"
  value       = "http://${aws_lb.main.dns_name}/rtc"
}

output "supabase_studio_url" {
  description = "URL to access Supabase Studio (Dashboard) via ALB"
  value       = "http://${aws_lb.main.dns_name}/"
}

# --- Developer IAM Outputs ---
output "aws_console_login_url" {
  description = "AWS Console login URL for IAM users"
  value       = "https://${data.aws_caller_identity.current.account_id}.signin.aws.amazon.com/console"
}

output "developer_user_arns" {
  description = "ARNs of the developer IAM users"
  value       = { for username, user in aws_iam_user.developers : username => user.arn }
}

output "developer_access_keys" {
  description = "Access key IDs for developer IAM users (for AWS CLI setup)"
  value       = { for username, key in aws_iam_access_key.developers : username => key.id }
}

output "developer_secret_keys" {
  description = "Secret access keys for developer IAM users (share securely, only shown once)"
  value       = { for username, key in aws_iam_access_key.developers : username => key.secret }
  sensitive   = true
}
