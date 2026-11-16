resource "aws_cloudwatch_log_group" "main" {
  name              = "/ecs/neo-production-cluster"
  retention_in_days = 7

  tags = {
    Environment = "production"
    Project     = "neo"
  }
}

resource "aws_cloudwatch_log_group" "livekit" {
  name              = "/ecs/livekit"
  retention_in_days = 7
}

# Consolidated log group for all auth-related services (GoTrue, Kong, PostgREST)
resource "aws_cloudwatch_log_group" "supabase_auth" {
  name              = "/ecs/supabase-auth"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "studio" {
  name              = "/ecs/supabase-studio"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "ai_backend" {
  name              = "/ecs/ai-backend"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "nestjs" {
  name              = "/ecs/nestjs"
  retention_in_days = 7
}
